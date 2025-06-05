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
import {
  extractTasks,
  updateTaskResult,
  getTaskProgress,
  updateMemoryWithTaskState,
  updateTaskProgress,
  updateCurrentTask,
  updateTaskResultInState,
  executeQueryTask,
  executeMutationTask
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

  return [queryAgentTool, mutationAgentTool];
};

// Create router for tool node
const createToolRouter = () => {
  const routes = new Map([
    ['transfer_to_query_agent', AgentType.QUERY],
    ['transfer_to_mutation_agent', AgentType.MUTATION],
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

DECISION PROCESS:
1. Review the current task description and type
2. Use the task's target agent to determine which transfer tool to use
3. Provide a clear reason for the transfer

RESPONSE FORMAT:
"I'll help you [action]. [Brief explanation]"
[Use the task's target agent transfer tool]

CRITICAL INSTRUCTIONS:
- ALWAYS use a transfer tool for each task
- Use the task's target agent to determine which transfer tool to use
- Provide a specific reason for the transfer
- Keep responses focused on the current task
- Use the exact tool names: transfer_to_query_agent or transfer_to_mutation_agent`,
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

  const nextTask = taskState.tasks[taskState.currentTaskIndex];
  if (!nextTask) {
    return { task: null, updatedState: state };
  }

  const updatedTaskState = {
    ...taskState,
    currentTaskIndex: taskState.currentTaskIndex + 1,
    tasks: taskState.tasks.map((task, index) => 
      index === taskState.currentTaskIndex ? { ...task, status: 'in_progress' } : task
    )
  };

  return {
    task: nextTask,
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
    const tasks = await extractTasks(originalRequest);
    // Initialize task state
    state = updateMemoryWithTaskState(state, { tasks });
    logEvent('info', AgentType.SUPERVISOR, 'tasks_extracted', { 
      tasks: tasks.map(t => ({ id: t.id, type: t.type, dependencies: t.dependencies }))
    });
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
    return new Command({
      goto: END,
      update: { 
        messages: [
          ...state.messages,
          new AIMessage({
            content: `All tasks completed. Successfully completed: ${progress.completed}, Failed: ${progress.failed}`
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

    logEvent('info', AgentType.SUPERVISOR, 'transfer_initiated', {
      targetAgent: toolCall.name.replace('transfer_to_', ''),
      reason,
      currentTask: task
    });

    return new Command({
      goto: AgentType.TOOL,
      update: {
        messages: [
          ...state.messages,
          lastMessage
        ],
        memory: state.memory
      }
    });
  }
  
  // If no tool calls were made, force a transfer based on task type
  const transferTool = task.type === 'query' ? 'transfer_to_query_agent' : 'transfer_to_mutation_agent';
  const reason = `Task requires ${task.type} operation`;
  
  // Create a new AIMessage with the tool call
  const forcedTransferMessage = new AIMessage({
    content: `I'll help you ${task.description}. ${reason}`,
    tool_calls: [{
      id: 'forced_transfer',
      name: transferTool,
      args: { reason }
    }]
  });
  
  // Track the decision
  state = await trackAgentDecision(state, {
    agent: AgentType.SUPERVISOR,
    action: transferTool,
    reason,
    remainingTasks: taskState.tasks
      .filter(t => t.status === 'pending')
      .map(t => t.description)
  });

  logEvent('info', AgentType.SUPERVISOR, 'transfer_initiated', {
    targetAgent: transferTool.replace('transfer_to_', ''),
    reason,
    currentTask: task
  });

  return new Command({
    goto: AgentType.TOOL,
    update: {
      messages: [
        ...state.messages,
        forcedTransferMessage
      ],
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

  const currentTask = taskState.tasks[taskState.currentTaskIndex - 1];
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
  const nextNode = currentTask.type === 'query' ? AgentType.QUERY : AgentType.MUTATION;
  
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
        ends: [AgentType.QUERY, AgentType.MUTATION, END]
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

        const currentTask = taskState.tasks[taskState.currentTaskIndex - 1];
        
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
        
        // Update task result and get new state
        const updatedState = updateTaskResultInState(state, currentTask.id, result);
        
        logEvent('info', AgentType.QUERY, 'task_completed', {
          taskId: currentTask.id,
          result
        });

        logEvent('info', AgentType.QUERY, 'flow_end', {
          duration: Date.now() - startTime
        });

        // Format user-friendly message from the result
        let userMessage = `Completed query task: ${currentTask.description}`;
        
        if (result.success && result.summary) {
          userMessage += `\n✅ ${result.summary}`;
          
          // If there's employee data, show a preview
          if (result.data?.employees?.employees && Array.isArray(result.data.employees.employees)) {
            const employees = result.data.employees.employees;
            const employeeCount = employees.length;
            
            if (employeeCount > 0) {
              userMessage += `\n\n👥 Found ${employeeCount} employee${employeeCount !== 1 ? 's' : ''}:`;
              
              // Show first 3 employees as preview
              const previewEmployees = employees.slice(0, 3);
              previewEmployees.forEach((emp: any, index: number) => {
                const name = emp.firstName ? `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''}` : emp.email;
                userMessage += `\n${index + 1}. ${name} (${emp.email})`;
              });
              
              if (employeeCount > 3) {
                userMessage += `\n... and ${employeeCount - 3} more`;
              }
            }
          }
        } else if (!result.success) {
          userMessage += `\n❌ Error: ${result.error || 'Unknown error occurred'}`;
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

        const currentTask = taskState.tasks[taskState.currentTaskIndex - 1];
        
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

        // Format user-friendly message from the result
        let userMessage = `Completed mutation task: ${currentTask.description}`;
        
        if ((result as any).success) {
          userMessage += `\n✅ Operation completed successfully`;
          if ((result as any).data && typeof (result as any).data === 'string') {
            userMessage += `\n📝 ${(result as any).data}`;
          }
        } else {
          userMessage += `\n❌ Error: ${(result as any).error || 'Unknown error occurred'}`;
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
      .addEdge(START, AgentType.SUPERVISOR)
      .addEdge(AgentType.TOOL, AgentType.QUERY)
      .addEdge(AgentType.TOOL, AgentType.MUTATION);

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({ checkpointer: memory });

    graph.name = "Supervisor Agent";

    return graph;
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

export { create_multi_agent_rita_graph }; 