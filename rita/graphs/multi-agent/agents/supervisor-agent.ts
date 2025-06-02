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
  extendTaskStateWithNewTasks,
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
  const taskCount = tasks.length;

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

  return [queryAgentTool, mutationAgentTool];
};

// Helper function to determine target agent based on task type
const determineTargetAgent = (taskType: string): string => {
  if (taskType === 'query') return "QUERY_DISCOVERY";
  if (taskType === 'mutation') return "MUTATION_DISCOVERY";
  return "QUERY_DISCOVERY"; // Default fallback
};

// Helper function to determine target agent based on tool call name
const determineTargetAgentFromTool = (toolName: string): string => {
  if (toolName === 'transfer_to_query_agent') return "QUERY_DISCOVERY";
  if (toolName === 'transfer_to_mutation_agent') return "MUTATION_DISCOVERY";
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
      // Always keep user messages
      if (msg.constructor.name === 'HumanMessage') {
        acc.messages.push(msg);
        return acc;
      }

      // For AI messages, check if it's a duplicate of the last message
      const lastMessage = acc.messages[acc.messages.length - 1];
      if (lastMessage && 
          lastMessage.constructor.name === msg.constructor.name && 
          JSON.stringify(lastMessage.content) === JSON.stringify(msg.content)) {
        // Skip duplicate AI messages
        logEvent('info', AgentType.SUPERVISOR, 'duplicate_message_skipped', {
          type: msg.constructor.name,
          content: msg.content
        });
        return acc;
      }
      
      // Keep the message if it's not a duplicate
      acc.messages.push(msg);
      return acc;
    }, { messages: [] as (AIMessage | ToolMessage)[], seen: new Set<string>() }).messages;

  // Get all user messages
  const userMessages = cleanMessages
    .filter(msg => msg.constructor.name === 'HumanMessage')
    .map(msg => msg.content)
    .filter((content): content is string => typeof content === 'string');

  // Get the most recent user message
  const newUserMessage = userMessages[userMessages.length - 1];

  // Log state for debugging
  logEvent('info', AgentType.SUPERVISOR, 'state_check', {
    hasTaskState: !!state.memory?.get('taskState'),
    lastProcessedMessage: state.memory?.get('lastProcessedMessage'),
    isProcessing: state.memory?.get('isProcessing'),
    recursionCount: state.memory?.get('recursionCount'),
    messageCount: state.messages.length,
    userMessageCount: userMessages.length,
    newUserMessage
  });

  // Check for recursion limit
  const recursionCount = (state.memory?.get('recursionCount') as number) || 0;
  if (recursionCount >= 25) {
    logEvent('error', AgentType.SUPERVISOR, 'recursion_limit_reached', {
      count: recursionCount
    });
    return new Command({
      goto: END,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: "I apologize, but I've reached the maximum number of processing steps. Please try rephrasing your request or breaking it down into smaller parts."
          })
        ]
      }
    });
  }

  // Only extract tasks if we have a user message and no active tasks are running
  const existingTaskState = state.memory?.get('taskState') as TaskState;
  const hasActiveTasks = existingTaskState?.tasks.some(t => 
    t.status === 'pending' || t.status === 'in_progress'
  );
  
  // Check if this is a different message from what we processed before
  const lastProcessedMessage = state.memory?.get('lastProcessedMessage') as string;
  const isDifferentMessage = lastProcessedMessage !== newUserMessage;
  
  // Check if all existing tasks are completed
  const allTasksCompleted = existingTaskState?.tasks.length > 0 && 
    existingTaskState.tasks.every(t => t.status === 'completed' || t.status === 'failed');

  // Check if we've already created tasks for this message in this session
  const lastTaskCreationMessage = state.memory?.get('lastTaskCreationMessage') as string;
  const alreadyCreatedTasksForThisMessage = lastTaskCreationMessage === newUserMessage;

  // CRITICAL FIX: Reset recursionCount to 0 for new user messages
  // This ensures fresh user input is always treated as user-initiated
  let effectiveRecursionCount = recursionCount;
  if (isDifferentMessage || (allTasksCompleted && !hasActiveTasks && !alreadyCreatedTasksForThisMessage)) {
    effectiveRecursionCount = 0;
  }

  // Key insight: Allow user to submit same message again after completion
  // - If effectiveRecursionCount is 0, this is a fresh user input (should process)
  // - If effectiveRecursionCount > 0, we're in internal processing loop (should not create new tasks for same message)
  const isUserInitiatedMessage = effectiveRecursionCount === 0;
  const shouldCreateTasks = isUserInitiatedMessage || isDifferentMessage;

  // Create tasks if:
  // 1. No active tasks AND
  // 2. We have a user message AND
  // 3. (This is a user-initiated message OR it's a different message) AND
  // 4. (No existing tasks OR user-initiated message (allows re-asking after completion) OR different message)
  if (!hasActiveTasks && newUserMessage && typeof newUserMessage === 'string' && 
      shouldCreateTasks && (!existingTaskState || isUserInitiatedMessage || isDifferentMessage)) {
    logEvent('info', AgentType.SUPERVISOR, 'creating_tasks_for_message', {
      message: newUserMessage,
      hasExistingTasks: !!existingTaskState,
      existingTaskCount: existingTaskState?.tasks.length || 0,
      isUserInitiated: isUserInitiatedMessage,
      isDifferent: isDifferentMessage,
      shouldCreate: shouldCreateTasks,
      recursionCount,
      alreadyCreatedTasksForThisMessage,
      effectiveRecursionCount
    });

    const executionStartTime = Date.now();
    const tasks = await extractTasks(newUserMessage);
    
    // Extend existing task state instead of overwriting it
    // This preserves completed tasks for context while adding new ones
    state = extendTaskStateWithNewTasks(state, { newTasks: tasks, executionStartTime });
    
    // Update memory to track this message as processed and tasks created
    const updatedMemory = new Map((state?.memory) || new Map());
    updatedMemory.set('lastProcessedMessage', newUserMessage);
    updatedMemory.set('lastTaskCreationMessage', newUserMessage);
    state = {
      ...state,
      memory: updatedMemory
    };
    
    logEvent('info', AgentType.SUPERVISOR, 'tasks_extracted', { 
      tasks: tasks?.map(t => ({ id: t.id, type: t.type, dependencies: t.dependencies })) || []
    });

    // Generate and return initial plan message
    const planMessage = tasks && tasks.length > 0 ? generateInitialPlanMessage(newUserMessage, tasks) : null;
    if (planMessage) {
      return new Command({
        goto: AgentType.SUPERVISOR,
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
      update: { 
        messages: state.messages,
        memory: state.memory  // Preserve any existing context
      }
    });
  }

  const progress = getTaskProgress(taskState);
  logEvent('info', AgentType.SUPERVISOR, 'task_progress', progress);

  // Check actual task statuses for completion (more reliable than Set-based progress)
  const actualCompleted = taskState.tasks.filter(t => t.status === 'completed').length;
  const actualFailed = taskState.tasks.filter(t => t.status === 'failed').length;
  const actualTotal = taskState.tasks.length;
  
  // If all tasks are completed or failed, end the flow
  if (actualCompleted + actualFailed === actualTotal && actualTotal > 0) {
    logEvent('info', AgentType.SUPERVISOR, 'all_tasks_completed_by_status', {
      actualCompleted,
      actualFailed,
      actualTotal,
      progressCompleted: progress.completed,
      progressFailed: progress.failed,
      progressTotal: progress.total
    });
    
    // Clear task creation tracking to allow fresh conversations
    const clearedMemory = new Map(state.memory || new Map());
    clearedMemory.delete('lastTaskCreationMessage');
    
    return new Command({
      goto: END,
      update: { 
        messages: state.messages,
        memory: clearedMemory  // Clear session tracking but preserve other context
      }
    });
  }

  // If no tasks are pending, end the flow
  if (progress.pending === 0 && progress.total > 0) {
    logEvent('info', AgentType.SUPERVISOR, 'no_pending_tasks');
    
    // Clear task creation tracking to allow fresh conversations
    const clearedMemory = new Map(state.memory || new Map());
    clearedMemory.delete('lastTaskCreationMessage');
    
    return new Command({
      goto: END,
      update: { 
        messages: state.messages,
        memory: clearedMemory  // Clear session tracking but preserve other context
      }
    });
  }

  // Increment recursion count (but don't set processing flag here)
  const currentRecursionCount = (state.memory?.get('recursionCount') as number) || 0;
  const newRecursionCount = currentRecursionCount + 1;
  
  const newMemory = new Map(state.memory || new Map());
  newMemory.set('recursionCount', newRecursionCount);
  // Remove the isProcessing flag that was causing the loop
  state = {
    ...state,
    memory: newMemory
  };

  // Now actually process the next available task
  logEvent('info', AgentType.SUPERVISOR, 'processing_next_task', {
    recursionCount: newRecursionCount,
    pendingTasks: progress.pending,
    totalTasks: progress.total
  });

  // Create and invoke supervisor agent core to manage task selection and execution
  let supervisorAgentCore: any;
  let coreStartTime: number = Date.now();
  let result: any;
  try {
    const model = new ChatOpenAI({ model: "gpt-4.1-mini", temperature: 0 });
    supervisorAgentCore = createSupervisorAgentCore(model);

    result = await supervisorAgentCore.invoke(state, config);
    logEvent('info', AgentType.SUPERVISOR, 'core_completed', {
      duration: Date.now() - coreStartTime
    });
      } catch (error) {
      logEvent('error', AgentType.SUPERVISOR, 'supervisor_agent_error', {
        error: error.message
      });
      
      return new Command({
        goto: END,
        update: { 
          messages: [
            ...state.messages,
            error.message.includes('429 You exceeded your current quota') ? new AIMessage({
              content: 'We are out of quota. Please try again later.'
            }) : new AIMessage({
              content: 'Something went wrong while processing your request. Please try again.'
            })
          ],
          memory: state.memory  // Preserve context even on errors
        }
      });
    }

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
            ],
            memory: state.memory  // Preserve context and completed tasks
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
    // Check if we have any pending tasks
    const taskState = state.memory?.get('taskState') as TaskState;
    if (taskState) {
      const pendingTasks = taskState.tasks.filter(t => t.status === 'pending');
      const inProgressTasks = taskState.tasks.filter(t => t.status === 'in_progress');
      
      if (pendingTasks.length > 0) {
        logEvent('info', AgentType.SUPERVISOR, 'pending_tasks_exist', {
          pendingTasks: pendingTasks.map(t => t.id)
        });
        
        // Continue to supervisor to process next task
        return new Command({
          goto: AgentType.SUPERVISOR,
          update: {
            messages: state.messages,
            memory: state.memory
          }
        });
      } else if (inProgressTasks.length > 0) {
        logEvent('info', AgentType.SUPERVISOR, 'in_progress_tasks_exist', {
          inProgressTasks: inProgressTasks.map(t => t.id)
        });
        
        // Wait for in-progress tasks to complete
        return new Command({
          goto: AgentType.SUPERVISOR,
          update: {
            messages: state.messages,
            memory: state.memory
          }
        });
      }
    }

    logEvent('info', AgentType.SUPERVISOR, 'no_available_tasks_fallback');
    return new Command({
      goto: END,
      update: { 
        messages: [
          ...state.messages,
          new AIMessage({
            content: 'All tasks have been completed.'
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
