import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Command } from "@langchain/langgraph";
import { createReactAgent, ToolNode } from "@langchain/langgraph/prebuilt";

import { MergedAnnotation, ExtendedState } from "../../states/states";
import { Task, TaskState } from './types';
import { AgentType } from './types/agents';
import { createTypeDetailsAgent } from './agents/type-details-agent';
import {
  extractTasks,
  updateTaskResult,
  getTaskProgress,
  updateMemoryWithTaskState,
  updateTaskProgress,
  updateTaskResultInState,
  executeQueryTask,
  executeMutationTask,
  executeTypeDetailsTask,
  injectTypeDetailsTaskIfNeeded
} from './tasks/tasks-handling';

// Define interfaces
interface AgentDecision {
  agent: AgentType;
  timestamp: string;
  action: string;
  reason: string;
  remainingTasks?: string[];
  currentTaskIndex?: number;
}

interface StructuredLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  agent: AgentType;
  event: string;
  details: Record<string, any>;
}

// Define tool call argument schemas
const transferToolSchema = z.object({
  reason: z.string().min(1, "Reason is required")
});

// Helper function to safely get tool call arguments
const getToolCallArgs = (toolCall: any) => {
  try {
    return transferToolSchema.parse(toolCall.args);
  } catch (error) {
    console.error('Invalid tool call arguments:', error);
    return { reason: 'Unspecified reason' };
  }
};

// Helper function for structured logging
const logEvent = (level: StructuredLog['level'], agent: AgentType, event: string, details: Record<string, any> = {}) => {
  const log: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    agent,
    event,
    details
  };
  console.log(JSON.stringify(log));
};

// Generate initial plan message for user
const generateInitialPlanMessage = (request: string, tasks: Task[]): string | null => {
  if (!tasks.length) return null;

  // Determine the main action based on task types
  const hasQuery = tasks.some(t => t.type === 'query');
  const hasMutation = tasks.some(t => t.type === 'mutation');
  const taskCount = tasks.filter(t => t.type !== 'type_details').length; // Don't count internal type details tasks

  let actionDescription = '';
  
  if (hasQuery && hasMutation) {
    actionDescription = `retrieve and update data (${taskCount} operations)`;
  } else if (hasQuery) {
    if (request.toLowerCase().includes('employee')) {
      actionDescription = 'retrieve employee information';
    } else if (request.toLowerCase().includes('user')) {
      actionDescription = 'retrieve user information';
    } else if (request.toLowerCase().includes('list') || request.toLowerCase().includes('get') || request.toLowerCase().includes('find')) {
      actionDescription = 'retrieve the requested information';
    } else {
      actionDescription = 'retrieve data';
    }
  } else if (hasMutation) {
    actionDescription = 'perform the requested changes';
  } else {
    actionDescription = 'process your request';
  }

  // Generate contextual message
  if (request.toLowerCase().includes('employee')) {
    return `🔍 I'll help you ${actionDescription}. Let me analyze the employee data structure and fetch the results.`;
  } else if (request.toLowerCase().includes('user') && request.toLowerCase().includes('me')) {
    return `👤 I'll retrieve your user profile information.`;
  } else if (request.toLowerCase().includes('list') || request.toLowerCase().includes('all')) {
    return `📋 I'll ${actionDescription}. This may require analyzing data structures first.`;
  } else if (hasMutation) {
    return `⚙️ I'll ${actionDescription}. Let me process this safely.`;
  } else {
    return `🔍 I'll ${actionDescription} for you.`;
  }
};

// Generate detailed completion summary
const generateCompletionSummary = (taskState: TaskState, progress: any): string => {
  const completedTasks = taskState.tasks.filter(task => task.status === 'completed');
  const failedTasks = taskState.tasks.filter(task => task.status === 'failed');
  const userTasks = taskState.tasks.filter(task => task.type !== 'type_details'); // Filter out internal tasks

  let summary = '';

  // Header with overall status
  if (progress.failed === 0) {
    summary = `## ✅ All Operations Completed Successfully\n`;
  } else {
    summary = `## ⚠️ Operations Completed with Issues\n`;
  }

  // Summary stats
  summary += `**Summary:** ${progress.completed} completed, ${progress.failed} failed out of ${progress.total} total operations\n\n`;

  // Detailed breakdown of completed tasks
  if (completedTasks.length > 0) {
    summary += `### 🎉 Successfully Completed:\n`;
    completedTasks.forEach((task, index) => {
      if (task.type !== 'type_details') { // Don't show internal type details tasks
        const taskNumber = index + 1;
        const icon = task.type === 'query' ? '📊' : task.type === 'mutation' ? '⚙️' : '🔧';
        summary += `${taskNumber}. ${icon} **${task.description}**\n`;
        
        // Add result summary if available
        if (task.result && task.result.success) {
          if (task.result.summary) {
            summary += `   └─ ${task.result.summary}\n`;
          } else if (task.result.data) {
            // Try to extract meaningful info from the result
            if (typeof task.result.data === 'string') {
              summary += `   └─ ${task.result.data}\n`;
            } else if (task.result.data.employees?.employees) {
              const count = task.result.data.employees.employees.length;
              summary += `   └─ Retrieved ${count} employee${count !== 1 ? 's' : ''}\n`;
            } else if (task.result.data.me) {
              summary += `   └─ Retrieved user profile information\n`;
            } else {
              summary += `   └─ Data retrieved successfully\n`;
            }
          }
        }
        summary += '\n';
      }
    });
  }

  // Detailed breakdown of failed tasks
  if (failedTasks.length > 0) {
    summary += `### ❌ Failed Operations:\n`;
    failedTasks.forEach((task, index) => {
      if (task.type !== 'type_details') {
        const taskNumber = index + 1;
        summary += `${taskNumber}. **${task.description}**\n`;
        if (task.error) {
          summary += `   └─ Error: ${task.error}\n`;
        }
        summary += '\n';
      }
    });
  }

  // Performance info with execution time
  const executionEndTime = Date.now();
  const executionStartTime = taskState.executionStartTime || executionEndTime;
  const durationMs = executionEndTime - executionStartTime;
  const durationSeconds = Math.round(durationMs / 1000);
  
  const completionTime = new Date(executionEndTime).toLocaleTimeString();
  
  summary += `---\n*Execution completed at ${completionTime} and took ${durationSeconds} second${durationSeconds !== 1 ? 's' : ''}*`;

  return summary;
};

// Utility function to update state
const assign = <T extends Record<string, any>>(updater: (state: T, ...args: any[]) => Partial<T>) => 
  (state: T, ...args: any[]): T => ({
    ...state,
    ...updater(state, ...args),
  });

const trackAgentDecision = assign<ExtendedState>((state, { decision }: { decision: Omit<AgentDecision, "timestamp"> }) => {
  const decisions = (state.memory || new Map()).get("agentDecisions") as AgentDecision[] || [];
  const newDecision = {
    ...decision,
    timestamp: new Date().toISOString(),
  };
  return {
    ...state,
    memory: new Map(state.memory || new Map()).set("agentDecisions", [...decisions, newDecision]),
  };
});

// Create tools for agent transfers
const createTransferTools = () => {
  const queryAgentTool = tool(
    async ({ reason }: { reason: string }) => {
      return `Transferring to query agent: ${reason}`;
    },
    {
      name: "transfer_to_query_agent",
      description: "Transfer to query agent for data retrieval operations",
      schema: z.object({
        reason: z.string().describe("Reason for the transfer"),
      }),
    }
  );

  const mutationAgentTool = tool(
    async ({ reason }: { reason: string }) => {
      return `Transferring to mutation agent: ${reason}`;
    },
    {
      name: "transfer_to_mutation_agent",
      description: "Transfer to mutation agent for data modification operations",
      schema: z.object({
        reason: z.string().describe("Reason for the transfer"),
      }),
    }
  );

  const typeDetailsAgentTool = tool(
    async ({ reason }: { reason: string }) => {
      return `Transferring to type details agent: ${reason}`;
    },
    {
      name: "transfer_to_type_details_agent",
      description: "Transfer to type details agent for GraphQL type introspection",
      schema: z.object({
        reason: z.string().describe("Reason for the transfer"),
      }),
    }
  );

  return [queryAgentTool, mutationAgentTool, typeDetailsAgentTool];
};

// Create router for tool node
const createToolRouter = () => {
  const routes = new Map([
    ['transfer_to_query_agent', AgentType.QUERY],
    ['transfer_to_mutation_agent', AgentType.MUTATION],
    ['transfer_to_type_details_agent', AgentType.TYPE_DETAILS],
    ['end_task', END]
  ]);

  return (toolName: string) => routes.get(toolName) || END;
};

/**
 * Creates a supervisor agent core with specific tools and prompt.
 */
const createSupervisorAgentCore = (model: ChatOpenAI) => {
  const transferTools = createTransferTools();
  
  return createReactAgent({
    llm: model,
    tools: transferTools,
    prompt: `You are a supervisor agent responsible for managing and executing tasks.

CURRENT TASK:
{currentTask}

TASK EXECUTION RULES:
1. For data retrieval tasks (get, find, retrieve, view, show, list, read, request):
   - Use transfer_to_query_agent
   - Example: "get user info" -> transfer_to_query_agent

2. For data modification tasks (create, update, delete, modify, change, set):
   - Use transfer_to_mutation_agent
   - Example: "update email" -> transfer_to_mutation_agent

3. For GraphQL type introspection tasks (type details, schema analysis):
   - Use transfer_to_type_details_agent
   - Example: "analyze GraphQL types" -> transfer_to_type_details_agent

DECISION PROCESS:
1. Review the current task description and type
2. Use the task's target agent to determine which transfer tool to use
3. Provide a clear reason for the transfer

RESPONSE FORMAT:
[Use the task's target agent transfer tool directly without explanatory text]

CRITICAL INSTRUCTIONS:
- ALWAYS use a transfer tool for each task
- Use the task's target agent to determine which transfer tool to use
- Provide a specific reason for the transfer
- Keep responses focused on the current task
- Use the exact tool names: transfer_to_query_agent, transfer_to_mutation_agent, or transfer_to_type_details_agent`,
    name: "supervisor_agent"
  });
};

/**
 * Gets the next available task that can be executed.
 */
const getNextTask = (state: ExtendedState): { task: Task | null; updatedState: ExtendedState } => {
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState || !taskState.tasks?.length) {
    return { task: null, updatedState: state };
  }

  console.log(`🎯 TASK SELECTOR - Looking for next task among ${taskState.tasks.length} tasks`);
  console.log(`🎯 TASK SELECTOR - Completed tasks:`, Array.from(taskState.completedTasks));
  console.log(`🎯 TASK SELECTOR - Failed tasks:`, Array.from(taskState.failedTasks));

  // Find the next available task that:
  // 1. Is pending
  // 2. Has all dependencies completed
  const availableTask = taskState.tasks.find(task => {
    console.log(`🎯 TASK SELECTOR - Checking task ${task.id}: status=${task.status}, dependencies=[${task.dependencies.join(', ')}]`);
    
    if (task.status !== 'pending') {
      console.log(`🎯 TASK SELECTOR - Task ${task.id} skipped: status is ${task.status}`);
      return false;
    }
    
    // Check if all dependencies are completed
    const allDependenciesCompleted = task.dependencies.every(depId => {
      const isCompleted = taskState.completedTasks.has(depId);
      console.log(`🎯 TASK SELECTOR - Dependency ${depId} completed: ${isCompleted}`);
      return isCompleted;
    });
    
    if (!allDependenciesCompleted) {
      console.log(`🎯 TASK SELECTOR - Task ${task.id} skipped: dependencies not completed`);
      return false;
    }
    
    console.log(`🎯 TASK SELECTOR - Task ${task.id} is available for execution`);
    return true;
  });

  if (!availableTask) {
    console.log(`🎯 TASK SELECTOR - No available tasks found`);
    return { task: null, updatedState: state };
  }

  console.log(`🎯 TASK SELECTOR - Selected task: ${availableTask.id}`);

  // Update the selected task to 'in_progress'
  const updatedTaskState = {
    ...taskState,
    tasks: taskState.tasks.map(task => 
      task.id === availableTask.id ? { ...task, status: 'in_progress' as const } : task
    )
  };

  return {
    task: availableTask,
    updatedState: {
      ...state,
      memory: new Map(state.memory || new Map()).set('taskState', updatedTaskState)
    }
  };
};

/**
 * Wrapper function that handles routing and task execution.
 */
const supervisorAgent = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.SUPERVISOR, 'flow_start', { startTime });
  
  // Clean and deduplicate messages
  const cleanMessages = state.messages
    .filter(msg => {
      if (typeof msg.content === 'string') {
        return msg.content.trim() !== '';
      }
      return true;
    })
    .reduce((acc, msg) => {
      const msgKey = `${msg.constructor.name}:${JSON.stringify(msg.content)}`;
      if (!acc.seen.has(msgKey)) {
        acc.seen.add(msgKey);
        acc.messages.push(msg);
      } else {
        logEvent('info', AgentType.SUPERVISOR, 'duplicate_message_skipped', {
          type: msg.constructor.name,
          content: msg.content
        });
      }
      return acc;
    }, { messages: [] as (AIMessage | ToolMessage)[], seen: new Set<string>() }).messages;

  // Get the original user request
  const originalRequest = cleanMessages
    .filter(msg => msg.constructor.name === 'HumanMessage')
    .pop()?.content;

  // Only extract tasks if we don't have a task state yet
  const existingTaskState = state.memory?.get('taskState') as TaskState;
  if (!existingTaskState && typeof originalRequest === 'string') {
    const executionStartTime = Date.now();
    const tasks = await extractTasks(originalRequest);
    // Initialize task state with start time
    state = updateMemoryWithTaskState(state, { tasks, executionStartTime });
    logEvent('info', AgentType.SUPERVISOR, 'tasks_extracted', { 
      tasks: tasks.map(t => ({ id: t.id, type: t.type, dependencies: t.dependencies }))
    });

    // Generate and return initial plan message
    const planMessage = generateInitialPlanMessage(originalRequest, tasks);
    if (planMessage) {
      return new Command({
        goto: AgentType.SUPERVISOR, // Continue processing
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: planMessage
            })
          ],
          memory: state.memory
        }
      });
    }
  }

  // Get task progress
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) {
    logEvent('info', AgentType.SUPERVISOR, 'no_task_state');
    return new Command({
      goto: END,
      update: { messages: state.messages }
    });
  }

  const progress = getTaskProgress(taskState);
  logEvent('info', AgentType.SUPERVISOR, 'task_progress', progress);

  // If all tasks are completed or failed, end the flow
  if (progress.completed + progress.failed === progress.total && progress.total > 0) {
    logEvent('info', AgentType.SUPERVISOR, 'all_tasks_completed', {
      completed: progress.completed,
      failed: progress.failed,
      total: progress.total
    });

    // Generate detailed completion summary
    const completionMessage = generateCompletionSummary(taskState, progress);
    
    return new Command({
      goto: END,
      update: { 
        messages: [
          ...state.messages,
          new AIMessage({
            content: completionMessage
          })
        ]
      }
    });
  }

  // If no tasks are pending, end the flow
  if (progress.pending === 0 && progress.total > 0) {
    logEvent('info', AgentType.SUPERVISOR, 'no_pending_tasks');
    return new Command({
      goto: END,
      update: { 
        messages: [
          ...state.messages,
          new AIMessage({
            content: 'No pending tasks remaining.'
          })
        ]
      }
    });
  }

  // Get the next task to execute
  const { task, updatedState } = getNextTask(state);
  if (!task) {
    logEvent('info', AgentType.SUPERVISOR, 'no_available_tasks');
    return new Command({
      goto: END,
      update: { 
        messages: [
          ...state.messages,
          new AIMessage({
            content: 'No available tasks to execute.'
          })
        ]
      }
    });
  }

  console.log(`🎯 SUPERVISOR - Selected task: ${task.id}`);
  console.log(`🎯 SUPERVISOR - Task type: ${task.type}`);
  console.log(`🎯 SUPERVISOR - Task description: ${task.description}`);
  console.log(`🎯 SUPERVISOR - Target agent: ${task.targetAgent}`);
  console.log(`🎯 SUPERVISOR - Dependencies: ${task.dependencies.join(', ') || 'none'}`);

  // Update state with the next task
  state = updatedState;
  logEvent('info', AgentType.SUPERVISOR, 'task_selected', { 
    taskId: task.id,
    type: task.type,
    description: task.description,
    targetAgent: task.targetAgent,
    dependencies: task.dependencies,
    status: task.status
  });

  // Add current task to the prompt
  const taskContext = `Current task: ${task.description} (Type: ${task.type}, Target Agent: ${task.targetAgent})`;
  const systemMessage = new AIMessage({
    content: taskContext,
    name: "system"
  });

  // Create and invoke supervisor agent core
  const model = new ChatOpenAI({
    model: 'gpt-4',
    temperature: 0,
  });
  const supervisorAgentCore = createSupervisorAgentCore(model);
  
  const coreStartTime = Date.now();
  const result = await supervisorAgentCore.invoke({
    ...state,
    messages: [...state.messages, systemMessage]
  }, config);
  logEvent('info', AgentType.SUPERVISOR, 'core_completed', {
    duration: Date.now() - coreStartTime
  });

  const lastMessage = result.messages[result.messages.length - 1] as AIMessage;
  
  // Clean up response
  if (typeof lastMessage.content === 'string') {
    let cleanedContent = lastMessage.content
      .replace(/Regenerate.*$/s, '')
      .replace(/Now, let's start.*$/s, '')
      .trim();
    
    const lines = cleanedContent.split('\n');
    const uniqueLines = [...new Set(lines)];
    if (lines.length !== uniqueLines.length) {
      logEvent('info', AgentType.SUPERVISOR, 'duplicate_lines_removed', {
        originalLines: lines.length,
        uniqueLines: uniqueLines.length
      });
      cleanedContent = uniqueLines.join('\n');
    }
    
    lastMessage.content = cleanedContent;
  }

  // Handle tool calls
  if (lastMessage.tool_calls?.length) {
    const toolCall = lastMessage.tool_calls[0];
    const { reason } = getToolCallArgs(toolCall);
    
    // Track the decision
    state = await trackAgentDecision(state, {
      agent: AgentType.SUPERVISOR,
      action: toolCall.name,
      reason,
      remainingTasks: taskState.tasks
        .filter(t => t.status === 'pending')
        .map(t => t.description)
    });

    // Determine target agent based on tool call
    let targetAgent: AgentType;
    if (toolCall.name === 'transfer_to_query_agent') {
      targetAgent = AgentType.QUERY;
    } else if (toolCall.name === 'transfer_to_mutation_agent') {
      targetAgent = AgentType.MUTATION;
    } else if (toolCall.name === 'transfer_to_type_details_agent') {
      targetAgent = AgentType.TYPE_DETAILS;
    } else {
      targetAgent = AgentType.QUERY; // Default fallback
    }

    logEvent('info', AgentType.SUPERVISOR, 'transfer_initiated', {
      targetAgent,
      reason,
      currentTask: task
    });

    // Direct transfer to avoid tool node recursion
    return new Command({
      goto: targetAgent,
      update: {
        messages: state.messages, // No technical messages
        memory: state.memory
      }
    });
  }
  
  // If no tool calls were made, force a direct transfer based on task type
  let targetAgent: AgentType;
  if (task.type === 'query') {
    targetAgent = AgentType.QUERY;
  } else if (task.type === 'mutation') {
    targetAgent = AgentType.MUTATION;
  } else if (task.type === 'type_details') {
    targetAgent = AgentType.TYPE_DETAILS;
  } else {
    targetAgent = AgentType.QUERY; // Default fallback
  }
  const reason = `Task requires ${task.type} operation`;
  
  // Track the decision
  state = await trackAgentDecision(state, {
    agent: AgentType.SUPERVISOR,
    action: `direct_transfer_to_${targetAgent}`,
    reason,
    remainingTasks: taskState.tasks
      .filter(t => t.status === 'pending')
      .map(t => t.description)
  });

  logEvent('info', AgentType.SUPERVISOR, 'direct_transfer_initiated', {
    targetAgent,
    reason,
    currentTask: task
  });

  // Direct transfer without going through tool node to avoid recursion
  return new Command({
    goto: targetAgent,
    update: {
      messages: state.messages, // No technical messages
      memory: state.memory
    }
  });
};

// Custom tool execution node that handles handoffs
const toolNode = async (
  state: ExtendedState,
  config: any
) => {
  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'flow_start', { startTime });
  
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  
  if (!lastMessage?.tool_calls?.length) {
    logEvent('info', AgentType.TOOL, 'no_tool_calls', {
      messageType: lastMessage?.constructor.name,
      hasToolCalls: !!lastMessage?.tool_calls,
      messageContent: lastMessage?.content
    });
    return new Command({
      goto: END,
      update: { messages: state.messages }
    });
  }

  // Get the current task from task state
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) {
    logEvent('info', AgentType.TOOL, 'no_task_state');
    return new Command({
      goto: END,
      update: { messages: state.messages }
    });
  }

  // Find the current task in progress
  const currentTask = taskState.tasks.find(task => task.status === 'in_progress');
  if (!currentTask) {
    logEvent('info', AgentType.TOOL, 'no_current_task');
    return new Command({
      goto: END,
      update: { messages: state.messages }
    });
  }

  // Create tool node with our transfer tools
  const transferTools = createTransferTools();
  const toolNodeHandler = new ToolNode(transferTools);
  
  logEvent('info', AgentType.TOOL, 'executing_tools', {
    toolCalls: lastMessage.tool_calls.map(call => ({
      name: call.name,
      args: call.args
    }))
  });
  
  // Execute tools in parallel
  const result = await toolNodeHandler.invoke(state);
  
  logEvent('info', AgentType.TOOL, 'tools_executed', {
    results: result.messages.map(msg => ({
      type: msg.constructor.name,
      content: msg.content,
      name: (msg as ToolMessage).name
    }))
  });
  
  // Get the first tool call for routing
  const firstToolCall = lastMessage.tool_calls[0];
  
  // Determine next node based on task type
  let nextNode;
  if (currentTask.type === 'query') {
    nextNode = AgentType.QUERY;
  } else if (currentTask.type === 'mutation') {
    nextNode = AgentType.MUTATION;
  } else if (currentTask.type === 'type_details') {
    nextNode = AgentType.TYPE_DETAILS;
  } else {
    nextNode = AgentType.QUERY; // Default fallback
  }
  
  logEvent('info', AgentType.TOOL, 'preparing_handoff', { 
    targetAgent: nextNode,
    nextNode,
    taskType: currentTask.type,
    toolCall: {
      name: firstToolCall.name,
      args: firstToolCall.args
    }
  });

  logEvent('info', AgentType.TOOL, 'flow_end', {
    duration: Date.now() - startTime,
    nextNode,
    messagesProcessed: result.messages.length
  });

  return new Command({
    goto: nextNode,
    update: { 
      messages: state.messages.concat(result.messages),
      memory: state.memory
    }
  });
};

const create_multi_agent_rita_graph = async () => {
  try {
    console.log("Initializing Multi-Agent RITA Graph...");

    // Create the nodes
    const workflow = new StateGraph(MergedAnnotation)
      .addNode(AgentType.SUPERVISOR, supervisorAgent, {
        ends: [AgentType.TOOL, END]
      })
      .addNode(AgentType.TOOL, toolNode, {
        ends: [AgentType.QUERY, AgentType.MUTATION, AgentType.TYPE_DETAILS, END]
      })
      .addNode(AgentType.QUERY, async (state: ExtendedState, config: any) => {
        const startTime = Date.now();
        logEvent('info', AgentType.QUERY, 'flow_start', { startTime });

        // Get the current task from task state
        const taskState = state.memory?.get('taskState') as TaskState;
        if (!taskState) {
          logEvent('info', AgentType.QUERY, 'no_task_state');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Find the current task in progress
        const currentTask = taskState.tasks.find(task => task.status === 'in_progress');
        
        if (!currentTask) {
          logEvent('info', AgentType.QUERY, 'no_current_task');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Skip if this is a mutation task
        if (currentTask.type === 'mutation') {
          logEvent('info', AgentType.QUERY, 'skipping_task', {
            taskId: currentTask.id,
            description: currentTask.description,
            reason: 'Task is mutation type, should be handled by mutation agent'
          });
          return new Command({
            goto: AgentType.SUPERVISOR,
            update: { messages: state.messages }
          });
        }

        logEvent('info', AgentType.QUERY, 'executing_task', {
          taskId: currentTask.id,
          description: currentTask.description,
          type: currentTask.type
        });

        // Execute query task
        const result = await executeQueryTask(currentTask, state, config);
        
        // Check if the result indicates type details are needed and inject them
        let workingState = state;
        if (result && result.requiresTypeDetails) {
          console.log(`🔍 QUERY NODE - Query task requires type details, injecting type details task`);
          workingState = injectTypeDetailsTaskIfNeeded(state, currentTask.id, result);
          
          // Return to supervisor to handle the new type details task quietly
          return new Command({
            goto: AgentType.SUPERVISOR,
            update: { 
              messages: state.messages, // Don't add technical messages to user conversation
              memory: workingState.memory
            }
          });
        }
        
        // Update task result and get new state
        const updatedState = updateTaskResultInState(workingState, currentTask.id, result);
        
        logEvent('info', AgentType.QUERY, 'task_completed', {
          taskId: currentTask.id,
          result
        });

        logEvent('info', AgentType.QUERY, 'flow_end', {
          duration: Date.now() - startTime
        });

        // Format clean, user-friendly message from the result
        let userMessage = '';
        
        if (result.success && result.summary) {
          userMessage = result.summary;
          
          // Handle different types of query results
          if (result.data) {
            // Handle "me" query result
            if (result.data.me) {
              const userData = result.data.me;
              userMessage = `👤 User Information:`;
              if (userData.firstName || userData.lastName) {
                const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
                userMessage += `\n📝 Name: ${fullName}`;
              }
              if (userData.email) {
                userMessage += `\n📧 Email: ${userData.email}`;
              }
              if (userData.id) {
                userMessage += `\n🆔 ID: ${userData.id}`;
              }
            }
            // Handle employees query result  
            else if (result.data.employees?.employees && Array.isArray(result.data.employees.employees)) {
              const employees = result.data.employees.employees;
              const employeeCount = employees.length;
              
              if (employeeCount > 0) {
                userMessage = `👥 Employee Directory (${employeeCount} ${employeeCount === 1 ? 'employee' : 'employees'}):`;
                
                // Show first 5 employees as preview with exact same formatting as user info
                const previewEmployees = employees.slice(0, 5);
                previewEmployees.forEach((emp: any) => {
                  const name = emp.firstName ? `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''}` : 'Unknown Name';
                  const email = emp.email || 'No email';
                  
                  // Clean up test emails for better readability
                  const displayEmail = email.includes('@zfprmusw.mailosaur.net') 
                    ? email.replace('@zfprmusw.mailosaur.net', '@company.com')
                    : email;
                  
                  userMessage += `\n\n📝 Name: ${name}`;
                  userMessage += `\n📧 Email: ${displayEmail}`;
                  if (emp.jobTitle) userMessage += `\n💼 ${emp.jobTitle}`;
                  if (emp.status) userMessage += `\n📊 Status: ${emp.status}`;
                  if (emp.id) userMessage += `\n🆔 ID: ${emp.id}`;
                });
                
                if (employeeCount > 5) {
                  userMessage += `\n\n*... and ${employeeCount - 5} more employees*`;
                }
              } else {
                userMessage = '👥 No employees found';
              }
            }
            // Generic handling for other query types
            else {
              const dataKeys = Object.keys(result.data);
              if (dataKeys.length > 0) {
                const firstKey = dataKeys[0];
                const firstValue = result.data[firstKey];
                
                if (Array.isArray(firstValue)) {
                  userMessage = `📊 Retrieved ${firstValue.length} items`;
                } else if (firstValue && typeof firstValue === 'object') {
                  userMessage = `📋 Data retrieved successfully`;
                }
              }
            }
          }
        } else if (!result.success) {
          userMessage = `❌ Error: ${(result as any).error || 'Unknown error occurred'}`;
        }

        // Return to supervisor for next task
        return new Command({
          goto: AgentType.SUPERVISOR,
          update: { 
            messages: [
              ...state.messages,
              new AIMessage({
                content: userMessage
              })
            ],
            memory: updatedState.memory
          }
        });
      })
      .addNode(AgentType.MUTATION, async (state: ExtendedState) => {
        const startTime = Date.now();
        logEvent('info', AgentType.MUTATION, 'flow_start', { startTime });

        // Get the current task from task state
        const taskState = state.memory?.get('taskState') as TaskState;
        if (!taskState) {
          logEvent('info', AgentType.MUTATION, 'no_task_state');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Find the current task in progress
        const currentTask = taskState.tasks.find(task => task.status === 'in_progress');
        
        if (!currentTask) {
          logEvent('info', AgentType.MUTATION, 'no_current_task');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Skip if this is a query task
        if (currentTask.type === 'query') {
          logEvent('info', AgentType.MUTATION, 'skipping_task', {
            taskId: currentTask.id,
            description: currentTask.description,
            reason: 'Task is query type, should be handled by query agent'
          });
          return new Command({
            goto: AgentType.SUPERVISOR,
            update: { messages: state.messages }
          });
        }

        logEvent('info', AgentType.MUTATION, 'executing_task', {
          taskId: currentTask.id,
          description: currentTask.description,
          type: currentTask.type
        });

        // Execute mutation task
        const result = await executeMutationTask(currentTask);
        
        // Update task result and get new state
        const updatedState = updateTaskResultInState(state, currentTask.id, result);
        
        logEvent('info', AgentType.MUTATION, 'task_completed', {
          taskId: currentTask.id,
          result
        });

        logEvent('info', AgentType.MUTATION, 'flow_end', {
          duration: Date.now() - startTime
        });

        // Format clean, user-friendly message from the result  
        let userMessage = '';
        
        if ((result as any).success) {
          userMessage = `✅ Operation completed successfully`;
          if ((result as any).data && typeof (result as any).data === 'string') {
            userMessage = `✅ ${(result as any).data}`;
          }
        } else {
          userMessage = `❌ Error: ${(result as any).error || 'Unknown error occurred'}`;
        }

        // Return to supervisor for next task
        return new Command({
          goto: AgentType.SUPERVISOR,
          update: { 
            messages: [
              ...state.messages,
              new AIMessage({
                content: userMessage
              })
            ],
            memory: updatedState.memory
          }
        });
      })
      .addNode(AgentType.TYPE_DETAILS, async (state: ExtendedState, config: any) => {
        const startTime = Date.now();
        logEvent('info', AgentType.TYPE_DETAILS, 'flow_start', { startTime });

        // Get the current task from task state
        const taskState = state.memory?.get('taskState') as TaskState;
        if (!taskState) {
          logEvent('info', AgentType.TYPE_DETAILS, 'no_task_state');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Find the current task in progress
        const currentTask = taskState.tasks.find(task => task.status === 'in_progress');
        
        if (!currentTask) {
          logEvent('info', AgentType.TYPE_DETAILS, 'no_current_task');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Skip if this is not a type details task
        if (currentTask.type !== 'type_details') {
          logEvent('info', AgentType.TYPE_DETAILS, 'skipping_task', {
            taskId: currentTask.id,
            description: currentTask.description,
            reason: 'Task is not type_details type'
          });
          return new Command({
            goto: AgentType.SUPERVISOR,
            update: { messages: state.messages }
          });
        }

        logEvent('info', AgentType.TYPE_DETAILS, 'executing_task', {
          taskId: currentTask.id,
          description: currentTask.description,
          type: currentTask.type
        });

        // Execute type details task
        const result = await executeTypeDetailsTask(currentTask, state, config);
        
        // Update task result and get new state
        const updatedState = updateTaskResultInState(state, currentTask.id, result);
        
        logEvent('info', AgentType.TYPE_DETAILS, 'task_completed', {
          taskId: currentTask.id,
          result
        });

        logEvent('info', AgentType.TYPE_DETAILS, 'flow_end', {
          duration: Date.now() - startTime
        });

        // Type details tasks are internal - don't show detailed messages to user
        let userMessage = '';
        
        // Only show error messages for type details tasks
        if (!(result as any).success) {
          userMessage = `❌ Error analyzing data types: ${(result as any).error || 'Unknown error occurred'}`;
        }
        // For successful type details, don't show any message - it's internal

        // Return to supervisor for next task
        return new Command({
          goto: AgentType.SUPERVISOR,
          update: { 
            messages: userMessage ? [
              ...state.messages,
              new AIMessage({
                content: userMessage
              })
            ] : state.messages, // Only add message if there's an error
            memory: updatedState.memory
          }
        });
      })
      .addEdge(START, AgentType.SUPERVISOR);
      // Note: Removed unconditional edges from TOOL node - routing is handled by Command.goto

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({ 
      checkpointer: memory
    });

    graph.name = "Supervisor Agent";

    return graph;
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

export { create_multi_agent_rita_graph }; 