import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { END, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Command } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { ExtendedState } from "../../../states/states";
import { Task, TaskState } from '../types';
import { AgentType } from '../types/agents';
import {
  extractTasks,
  getTaskProgress,
  updateMemoryWithTaskState,
  getNextTask,
  createGetNextTaskTool,
} from '../tasks/tasks-handling';

// Define interfaces
export interface AgentDecision {
  agent: AgentType;
  timestamp: string;
  action: string;
  reason: string;
  remainingTasks?: string[];
  currentTaskIndex?: number;
}

export interface StructuredLog {
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
export const logEvent = (level: StructuredLog['level'], agent: AgentType, event: string, details: Record<string, any> = {}) => {
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
export const generateInitialPlanMessage = (request: string, tasks: Task[]): string | null => {
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
export const generateCompletionSummary = (taskState: TaskState, progress: any): string => {
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

export const trackAgentDecision = assign<ExtendedState>((state, { decision }: { decision: Omit<AgentDecision, "timestamp"> }) => {
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
export const createTransferTools = () => {
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

// Helper function to determine target agent based on task type
const determineTargetAgent = (taskType: string): string => {
  if (taskType === 'query') return "QUERY_DISCOVERY";
  if (taskType === 'mutation') return AgentType.MUTATION;
  if (taskType === 'type_details') return AgentType.TYPE_DETAILS;
  return "QUERY_DISCOVERY"; // Default fallback
};

// Helper function to determine target agent based on tool call name
const determineTargetAgentFromTool = (toolName: string): string => {
  if (toolName === 'transfer_to_query_agent') return "QUERY_DISCOVERY";
  if (toolName === 'transfer_to_mutation_agent') return AgentType.MUTATION;
  if (toolName === 'transfer_to_type_details_agent') return AgentType.TYPE_DETAILS;
  return "QUERY_DISCOVERY"; // Default fallback
};

// Create all supervisor tools including task management
export const createSupervisorTools = () => {
  const transferTools = createTransferTools();
  const getNextTaskTool = createGetNextTaskTool();
  
  return [...transferTools, getNextTaskTool];
};

/**
 * Creates a supervisor agent core with specific tools and prompt.
 */
const createSupervisorAgentCore = (model: ChatOpenAI) => {
  const supervisorTools = createSupervisorTools();
  
  return createReactAgent({
    llm: model,
    tools: supervisorTools,
    prompt: `You are a supervisor agent responsible for managing and executing tasks.

TASK MANAGEMENT:
- Use get_next_task to select the next available task when no specific task is provided
- Action parameter: "select_next" to get the next available task based on dependencies

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

WORKFLOW:
1. If no current task is specified, use get_next_task with action "select_next"
2. Once you have a task, use the appropriate transfer tool based on task type
3. Provide clear reasons for tool usage

DECISION PROCESS:
1. Check if a current task is available
2. If not, use get_next_task to select the next available task
3. Review the task description and type
4. Use the task's target agent to determine which transfer tool to use
5. Provide a clear reason for the transfer

AVAILABLE TOOLS:
- get_next_task: Select next available task
- transfer_to_query_agent: Transfer to query agent
- transfer_to_mutation_agent: Transfer to mutation agent  
- transfer_to_type_details_agent: Transfer to type details agent

CRITICAL INSTRUCTIONS:
- ALWAYS use tools to manage workflow
- Use get_next_task when no current task is available
- Use appropriate transfer tools based on task type
- Provide specific reasons for tool usage
- Keep responses focused and actionable`,
    name: "supervisor_agent"
  });
};



/**
 * Main supervisor agent function that handles routing and task execution.
 */
export const supervisorAgent = async (state: ExtendedState, config: any) => {
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

  // Create and invoke supervisor agent core to manage task selection and execution
  const model = new ChatOpenAI({
    model: 'gpt-4',
    temperature: 0,
  });
  const supervisorAgentCore = createSupervisorAgentCore(model);
  
  const coreStartTime = Date.now();
  const result = await supervisorAgentCore.invoke(state, config);
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
    
    // Handle get_next_task tool call
    if (toolCall.name === 'get_next_task') {
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

      // Continue to agent transfer logic
      const reason = `Task selected: ${task.description}`;
      
      // Track the decision
      state = await trackAgentDecision(state, {
        agent: AgentType.SUPERVISOR,
        action: 'task_selected',
        reason,
        remainingTasks: taskState.tasks
          .filter(t => t.status === 'pending')
          .map(t => t.description)
      });

      // Determine target agent based on task type
      const targetAgent = determineTargetAgent(task.type);

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
    
    // Handle transfer tool calls
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
    const targetAgent = determineTargetAgentFromTool(toolCall.name);

    logEvent('info', AgentType.SUPERVISOR, 'transfer_initiated', {
      targetAgent,
      reason,
      currentTask: null
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
  
  // If no tool calls were made, try to get next task directly
  const { task, updatedState } = getNextTask(state);
  if (!task) {
    logEvent('info', AgentType.SUPERVISOR, 'no_available_tasks_fallback');
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

  // Force a direct transfer based on task type
  const targetAgent = determineTargetAgent(task.type);
  const reason = `Task requires ${task.type} operation`;
  
  // Update state with the next task
  state = updatedState;
  
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