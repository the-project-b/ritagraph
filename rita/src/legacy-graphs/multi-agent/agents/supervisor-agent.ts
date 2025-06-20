import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Command } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { ExtendedState } from "../../../states/states";
import { TaskState } from "../types";
import { AgentType } from "../types/agents";
import {
  extractTasks,
  getTaskProgress,
  extendTaskStateWithNewTasks,
  getNextTask,
  createGetNextTaskTool,
} from "../tasks/tasks-handling";

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
  level: "info" | "warn" | "error";
  agent: AgentType;
  event: string;
  details: Record<string, any>;
}

// Define tool call argument schemas
const transferToolSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

// Helper function to safely get tool call arguments
const getToolCallArgs = (toolCall: any) => {
  try {
    return transferToolSchema.parse(toolCall.args);
  } catch (error) {
    console.error("Invalid tool call arguments:", error);
    return { reason: "Unspecified reason" };
  }
};

// Helper function for structured logging
export const logEvent = (
  level: StructuredLog["level"],
  agent: AgentType,
  event: string,
  details: Record<string, any> = {}
) => {
  const log: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    agent,
    event,
    details,
  };
  console.log(JSON.stringify(log));
};

import { safeCreateMemoryMap } from "../utils/memory-helpers";

// Utility function to update state
const assign =
  <T extends Record<string, any>>(
    updater: (state: T, ...args: any[]) => Partial<T>
  ) =>
  (state: T, ...args: any[]): T => ({
    ...state,
    ...updater(state, ...args),
  });

export const trackAgentDecision = assign<ExtendedState>(
  (state, { decision }: { decision: Omit<AgentDecision, "timestamp"> }) => {
    const memoryMap = safeCreateMemoryMap(state.memory);
    const decisions =
      (memoryMap.get("agentDecisions") as AgentDecision[]) || [];
    const newDecision = {
      ...decision,
      timestamp: new Date().toISOString(),
    };
    return {
      ...state,
      memory: memoryMap.set("agentDecisions", [...decisions, newDecision]),
    };
  }
);

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
      description:
        "Transfer to mutation agent for data modification operations",
      schema: z.object({
        reason: z.string().describe("Reason for the transfer"),
      }),
    }
  );

  return [queryAgentTool, mutationAgentTool];
};

// Helper function to determine target agent based on task type
const determineTargetAgent = (taskType: string): string => {
  if (taskType === "query") return "QUERY_DISCOVERY";
  if (taskType === "mutation") return "MUTATION_DISCOVERY";
  return "QUERY_DISCOVERY"; // Default fallback
};

// Helper function to determine target agent based on tool call name
const determineTargetAgentFromTool = (toolName: string): string => {
  if (toolName === "transfer_to_query_agent") return "QUERY_DISCOVERY";
  if (toolName === "transfer_to_mutation_agent") return "MUTATION_DISCOVERY";
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
const createSupervisorAgentCore = async (
  model: ChatOpenAI,
  state: ExtendedState,
  config: any
) => {
  const supervisorTools = createSupervisorTools();

  // Load the supervisor prompt using the configurable template system
  let prompt: any = ``;
  try {
    const { loadTemplatePrompt } = await import(
      "../prompts/configurable-prompt-resolver"
    );
    const promptResult = await loadTemplatePrompt(
      "template_supervisor",
      state,
      config,
      model,
      false
    );

    prompt = promptResult.populatedPrompt?.value || "";
    console.log(
      "🔧 SUPERVISOR - Successfully loaded configurable template prompt"
    );
  } catch (error) {
    console.warn("Failed to load supervisor template prompt:", error);
    // Fallback to default prompt - supervisor will work with empty prompt
    prompt = ``;
  }

  return createReactAgent({
    llm: model,
    tools: supervisorTools,
    prompt: prompt,
    name: "multi_agent",
  });
};

/**
 * Main supervisor agent function that handles routing and task execution.
 */
export const supervisorAgent = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent("info", AgentType.SUPERVISOR, "flow_start", { startTime });

  // Clean and deduplicate messages
  const cleanMessages = state.messages
    .filter((msg) => {
      if (typeof msg.content === "string") {
        return msg.content.trim() !== "";
      }
      return true;
    })
    .reduce(
      (acc, msg) => {
        // Always keep user messages
        if (msg.constructor.name === "HumanMessage") {
          acc.messages.push(msg);
          return acc;
        }

        // For AI messages, check if it's a duplicate of the last message
        const lastMessage = acc.messages[acc.messages.length - 1];
        if (
          lastMessage &&
          lastMessage.constructor.name === msg.constructor.name &&
          JSON.stringify(lastMessage.content) === JSON.stringify(msg.content)
        ) {
          // Skip duplicate AI messages
          logEvent("info", AgentType.SUPERVISOR, "duplicate_message_skipped", {
            type: msg.constructor.name,
            content: msg.content,
          });
          return acc;
        }

        // Keep the message if it's not a duplicate
        acc.messages.push(msg);
        return acc;
      },
      { messages: [] as (AIMessage | ToolMessage)[], seen: new Set<string>() }
    ).messages;

  // Get all user messages
  const userMessages = cleanMessages
    .filter((msg) => msg.constructor.name === "HumanMessage")
    .map((msg) => msg.content)
    .filter((content): content is string => typeof content === "string");

  // Get the most recent user message
  const newUserMessage = userMessages[userMessages.length - 1];

  // CRITICAL: Store userRequest immediately when we get a user message
  // This ensures it's available throughout the entire flow
  if (newUserMessage && typeof newUserMessage === "string") {
    const updatedMemory = safeCreateMemoryMap(state.memory);
    updatedMemory.set("userRequest", newUserMessage);
    state = {
      ...state,
      memory: updatedMemory,
    };
    console.log("🔧 SUPERVISOR - Stored userRequest:", newUserMessage);
  }

  // Log state for debugging
  logEvent("info", AgentType.SUPERVISOR, "state_check", {
    hasTaskState: !!state.memory?.get("taskState"),
    lastProcessedMessage: state.memory?.get("lastProcessedMessage"),
    isProcessing: state.memory?.get("isProcessing"),
    recursionCount: state.memory?.get("recursionCount"),
    messageCount: state.messages.length,
    userMessageCount: userMessages.length,
    newUserMessage,
    storedUserRequest: state.memory?.get("userRequest"),
  });

  // Check for recursion limit
  const recursionCount = (state.memory?.get("recursionCount") as number) || 0;
  if (recursionCount >= 25) {
    logEvent("error", AgentType.SUPERVISOR, "recursion_limit_reached", {
      count: recursionCount,
    });

    // Clear task creation tracking to allow fresh conversations after recursion limit
    const clearedMemory = safeCreateMemoryMap(state.memory);
    clearedMemory.delete("lastTaskCreationMessage");

    return new Command({
      goto: END,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content:
              "I apologize, but I've reached the maximum number of processing steps. Please try rephrasing your request or breaking it down into smaller parts.",
          }),
        ],
        memory: clearedMemory,
      },
    });
  }

  // Only extract tasks if we have a user message and no active tasks are running
  const existingTaskState = state.memory?.get("taskState") as TaskState;
  const hasActiveTasks = existingTaskState?.tasks.some(
    (t) => t.status === "pending" || t.status === "in_progress"
  );
  const hasPendingTasks = existingTaskState?.tasks.some(
    (t) => t.status === "pending"
  );
  const hasAnyIncompleteTasks = existingTaskState?.tasks.some(
    (t) =>
      t.status === "pending" ||
      t.status === "in_progress" ||
      (t.status !== "completed" && t.status !== "failed")
  );

  // DEBUG: Log actual task states to find the issue
  if (existingTaskState?.tasks) {
    logEvent("info", AgentType.SUPERVISOR, "task_state_debug", {
      totalTasks: existingTaskState.tasks.length,
      taskStatuses: existingTaskState.tasks.map((t) => ({
        id: t.id,
        status: t.status,
        dependencies: t.dependencies,
      })),
      hasActiveTasks,
      hasPendingTasks,
      hasAnyIncompleteTasks,
      recursionCount,
    });
  }

  // Check if this is a different message from what we processed before
  const lastProcessedMessage = state.memory?.get(
    "lastProcessedMessage"
  ) as string;
  const isDifferentMessage = lastProcessedMessage !== newUserMessage;

  // Check if all existing tasks are completed
  const allTasksCompleted =
    existingTaskState?.tasks.length > 0 &&
    existingTaskState.tasks.every(
      (t) => t.status === "completed" || t.status === "failed"
    );

  // Check if we've already created tasks for this message in this session
  const lastTaskCreationMessage = state.memory?.get(
    "lastTaskCreationMessage"
  ) as string;
  const alreadyCreatedTasksForThisMessage =
    lastTaskCreationMessage === newUserMessage;

  // CRITICAL FIX: Reset recursionCount to 0 for new user messages
  // This ensures fresh user input is always treated as user-initiated
  let effectiveRecursionCount = recursionCount;
  if (isDifferentMessage || (allTasksCompleted && !hasAnyIncompleteTasks)) {
    effectiveRecursionCount = 0;
  }

  // Key insight: Allow user to submit same message again after completion
  // - If effectiveRecursionCount is 0, this is a fresh user input (should process)
  // - If effectiveRecursionCount > 0, we're in internal processing loop (should not create new tasks for same message)
  const isUserInitiatedMessage = effectiveRecursionCount === 0;

  // CRITICAL FIX: Don't create tasks if we're coming from internal processing (high recursion count)
  // This prevents the result-formatting-node → supervisor loop from creating duplicate tasks
  // BUT allow legitimate user re-asking after all tasks are completed
  const isComingFromInternalProcessing =
    recursionCount > 0 && !isDifferentMessage && hasAnyIncompleteTasks;

  const shouldCreateTasks = isUserInitiatedMessage || isDifferentMessage;

  // Additional check: prevent infinite loops during active processing
  // Block if: already created tasks for this message AND high recursion count (internal processing) AND same message
  const isInternalProcessingLoop = recursionCount > 3; // High recursion indicates internal loop, not user input
  const shouldBlockForInfiniteLoop =
    alreadyCreatedTasksForThisMessage &&
    isInternalProcessingLoop &&
    !isDifferentMessage;

  if (shouldBlockForInfiniteLoop) {
    logEvent("info", AgentType.SUPERVISOR, "blocking_infinite_loop", {
      message: newUserMessage,
      alreadyCreatedTasksForThisMessage,
      isInternalProcessingLoop,
      isDifferentMessage,
      recursionCount,
    });
  }

  // Create tasks if:
  // 1. No active tasks AND
  // 2. We have a user message AND
  // 3. (This is a user-initiated message OR it's a different message) AND
  // 4. (No existing tasks OR user-initiated message (allows re-asking after completion) OR different message) AND
  // 5. NOT blocked for infinite loop prevention AND
  // 6. NOT coming from internal processing (prevents result-formatting → supervisor loops)
  if (
    !hasActiveTasks &&
    newUserMessage &&
    typeof newUserMessage === "string" &&
    shouldCreateTasks &&
    (!existingTaskState || isUserInitiatedMessage || isDifferentMessage) &&
    !shouldBlockForInfiniteLoop &&
    !isComingFromInternalProcessing
  ) {
    logEvent("info", AgentType.SUPERVISOR, "creating_tasks_for_message", {
      message: newUserMessage,
      hasExistingTasks: !!existingTaskState,
      existingTaskCount: existingTaskState?.tasks.length || 0,
      isUserInitiated: isUserInitiatedMessage,
      isDifferent: isDifferentMessage,
      shouldCreate: shouldCreateTasks,
      recursionCount,
      alreadyCreatedTasksForThisMessage,
      effectiveRecursionCount,
      isComingFromInternalProcessing,
      hasPendingTasks,
      hasAnyIncompleteTasks,
    });

    const executionStartTime = Date.now();
    const tasks = await extractTasks(newUserMessage, state, config);

    // Extend existing task state instead of overwriting it
    // This preserves completed tasks for context while adding new ones
    state = extendTaskStateWithNewTasks(state, {
      newTasks: tasks,
      executionStartTime,
    });

    // Update memory to track this message as processed and tasks created
    const updatedMemory = safeCreateMemoryMap(state?.memory);
    updatedMemory.set("lastProcessedMessage", newUserMessage);
    updatedMemory.set("lastTaskCreationMessage", newUserMessage);
    updatedMemory.set("userRequest", newUserMessage); // Store user request for other nodes
    state = {
      ...state,
      memory: updatedMemory,
    };

    logEvent("info", AgentType.SUPERVISOR, "tasks_extracted", {
      tasks:
        tasks?.map((t) => ({
          id: t.id,
          type: t.type,
          dependencies: t.dependencies,
        })) || [],
    });

    // Route to initial plan node to generate and send plan message
    if (tasks && tasks.length > 0) {
      return new Command({
        goto: "INITIAL_PLAN",
        update: {
          messages: state.messages,
          memory: state.memory,
        },
      });
    }
  }

  // Get task progress
  const taskState = state.memory?.get("taskState") as TaskState;
  if (!taskState) {
    logEvent("info", AgentType.SUPERVISOR, "no_task_state");

    // Clear task creation tracking to allow fresh conversations
    const clearedMemory = safeCreateMemoryMap(state.memory);
    clearedMemory.delete("lastTaskCreationMessage");

    return new Command({
      goto: END,
      update: {
        messages: state.messages,
        memory: clearedMemory, // Clear session tracking but preserve other context
      },
    });
  }

  const progress = getTaskProgress(taskState);
  logEvent("info", AgentType.SUPERVISOR, "task_progress", progress);

  // Check actual task statuses for completion (more reliable than Set-based progress)
  const actualCompleted = taskState.tasks.filter(
    (t) => t.status === "completed"
  ).length;
  const actualFailed = taskState.tasks.filter(
    (t) => t.status === "failed"
  ).length;
  const actualTotal = taskState.tasks.length;

  // If all tasks are completed or failed, end the flow
  if (actualCompleted + actualFailed === actualTotal && actualTotal > 0) {
    logEvent("info", AgentType.SUPERVISOR, "all_tasks_completed_by_status", {
      actualCompleted,
      actualFailed,
      actualTotal,
      progressCompleted: progress.completed,
      progressFailed: progress.failed,
      progressTotal: progress.total,
    });

    // Clear task creation tracking to allow fresh conversations
    const clearedMemory = safeCreateMemoryMap(state.memory);
    clearedMemory.delete("lastTaskCreationMessage");

    return new Command({
      goto: END,
      update: {
        messages: state.messages,
        memory: clearedMemory, // Clear session tracking but preserve other context
      },
    });
  }

  // If no tasks exist at all, or no tasks are pending, end the flow
  if (progress.total === 0 || (progress.pending === 0 && progress.total > 0)) {
    const reason =
      progress.total === 0 ? "no_tasks_created" : "no_pending_tasks";
    logEvent("info", AgentType.SUPERVISOR, reason);

    // Clear task creation tracking to allow fresh conversations
    const clearedMemory = safeCreateMemoryMap(state.memory);
    clearedMemory.delete("lastTaskCreationMessage");

    // If no tasks were created, provide a helpful message
    const messages =
      progress.total === 0
        ? [
            ...state.messages,
            new AIMessage({
              content:
                "I understand you're asking, but I'm not sure what specific information you need. Could you please provide more details about what you'd like to know?",
            }),
          ]
        : state.messages;

    return new Command({
      goto: END,
      update: {
        messages,
        memory: clearedMemory, // Clear session tracking but preserve other context
      },
    });
  }

  // Increment recursion count (but don't set processing flag here)
  const currentRecursionCount =
    (state.memory?.get("recursionCount") as number) || 0;
  const newRecursionCount = currentRecursionCount + 1;

  const newMemory = safeCreateMemoryMap(state.memory);
  newMemory.set("recursionCount", newRecursionCount);
  // Remove the isProcessing flag that was causing the loop
  state = {
    ...state,
    memory: newMemory,
  };

  // Now actually process the next available task
  logEvent("info", AgentType.SUPERVISOR, "processing_next_task", {
    recursionCount: newRecursionCount,
    pendingTasks: progress.pending,
    totalTasks: progress.total,
  });

  // Create and invoke supervisor agent core to manage task selection and execution
  let supervisorAgentCore: any;
  let coreStartTime: number = Date.now();
  let result: any;
  try {
    const model = new ChatOpenAI({ model: "gpt-4.1-mini", temperature: 0 });
    supervisorAgentCore = await createSupervisorAgentCore(model, state, config);

    result = await supervisorAgentCore.invoke(state, config);
    logEvent("info", AgentType.SUPERVISOR, "core_completed", {
      duration: Date.now() - coreStartTime,
    });
  } catch (error) {
    logEvent("error", AgentType.SUPERVISOR, "supervisor_agent_error", {
      error: error.message,
    });

    // Clear task creation tracking to allow fresh conversations even on errors
    const clearedMemory = safeCreateMemoryMap(state.memory);
    clearedMemory.delete("lastTaskCreationMessage");

    return new Command({
      goto: END,
      update: {
        messages: [
          ...state.messages,
          error.message.includes("429 You exceeded your current quota")
            ? new AIMessage({
                content: "We are out of quota. Please try again later.",
              })
            : new AIMessage({
                content:
                  "Something went wrong while processing your request. Please try again.",
              }),
        ],
        memory: clearedMemory, // Clear session tracking but preserve other context
      },
    });
  }

  const lastMessage = result.messages[result.messages.length - 1] as AIMessage;

  // Clean up response
  if (typeof lastMessage.content === "string") {
    let cleanedContent = lastMessage.content
      .replace(/Regenerate.*$/s, "")
      .replace(/Now, let's start.*$/s, "")
      .trim();

    const lines = cleanedContent.split("\n");
    const uniqueLines = [...new Set(lines)];
    if (lines.length !== uniqueLines.length) {
      logEvent("info", AgentType.SUPERVISOR, "duplicate_lines_removed", {
        originalLines: lines.length,
        uniqueLines: uniqueLines.length,
      });
      cleanedContent = uniqueLines.join("\n");
    }

    lastMessage.content = cleanedContent;
  }

  // Handle tool calls
  if (lastMessage.tool_calls?.length) {
    const toolCall = lastMessage.tool_calls[0];

    // Handle get_next_task tool call
    if (toolCall.name === "get_next_task") {
      const { task, updatedState } = getNextTask(state);
      if (!task) {
        logEvent("info", AgentType.SUPERVISOR, "no_available_tasks");

        // Clear task creation tracking to allow fresh conversations
        const clearedMemory = safeCreateMemoryMap(state.memory);
        clearedMemory.delete("lastTaskCreationMessage");

        return new Command({
          goto: END,
          update: {
            messages: [
              ...state.messages,
              new AIMessage({
                content: "No available tasks to execute.",
              }),
            ],
            memory: clearedMemory, // Clear session tracking but preserve other context
          },
        });
      }

      console.log(`🎯 SUPERVISOR - Selected task: ${task.id}`);
      console.log(`🎯 SUPERVISOR - Task type: ${task.type}`);
      console.log(`🎯 SUPERVISOR - Task description: ${task.description}`);
      console.log(`🎯 SUPERVISOR - Target agent: ${task.targetAgent}`);
      console.log(
        `🎯 SUPERVISOR - Dependencies: ${
          task.dependencies.join(", ") || "none"
        }`
      );

      // Update state with the next task
      state = updatedState;
      logEvent("info", AgentType.SUPERVISOR, "task_selected", {
        taskId: task.id,
        type: task.type,
        description: task.description,
        targetAgent: task.targetAgent,
        dependencies: task.dependencies,
        status: task.status,
      });

      // Continue to agent transfer logic
      const reason = `Task selected: ${task.description}`;

      // Track the decision
      state = await trackAgentDecision(state, {
        agent: AgentType.SUPERVISOR,
        action: "task_selected",
        reason,
        remainingTasks: taskState.tasks
          .filter((t) => t.status === "pending")
          .map((t) => t.description),
      });

      // Determine target agent based on task type
      const targetAgent = determineTargetAgent(task.type);

      logEvent("info", AgentType.SUPERVISOR, "transfer_initiated", {
        targetAgent,
        reason,
        currentTask: task,
      });

      // Clear retry count on successful task selection and transfer
      const clearedMemory = safeCreateMemoryMap(state.memory);
      clearedMemory.delete("noTaskRetryCount");

      // Direct transfer to avoid tool node recursion
      return new Command({
        goto: targetAgent,
        update: {
          messages: state.messages, // No technical messages
          memory: clearedMemory,
        },
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
        .filter((t) => t.status === "pending")
        .map((t) => t.description),
    });

    // Determine target agent based on tool call
    const targetAgent = determineTargetAgentFromTool(toolCall.name);

    logEvent("info", AgentType.SUPERVISOR, "transfer_initiated", {
      targetAgent,
      reason,
      currentTask: null,
    });

    // Clear retry count on successful tool-based transfer
    const clearedMemory = safeCreateMemoryMap(state.memory);
    clearedMemory.delete("noTaskRetryCount");

    // Direct transfer to avoid tool node recursion
    return new Command({
      goto: targetAgent,
      update: {
        messages: state.messages, // No technical messages
        memory: clearedMemory,
      },
    });
  }

  // If no tool calls were made, try to get next task directly
  const { task, updatedState } = getNextTask(state);

  // DEBUG: Log getNextTask result
  logEvent("info", AgentType.SUPERVISOR, "get_next_task_result", {
    foundTask: !!task,
    taskId: task?.id,
    taskStatus: task?.status,
    taskDependencies: task?.dependencies,
    totalTasksInState:
      (state.memory?.get("taskState") as TaskState)?.tasks?.length || 0,
  });

  if (!task) {
    // Check if we have any pending tasks
    const taskState = state.memory?.get("taskState") as TaskState;
    if (taskState) {
      const pendingTasks = taskState.tasks.filter(
        (t) => t.status === "pending"
      );
      const inProgressTasks = taskState.tasks.filter(
        (t) => t.status === "in_progress"
      );

      // CRITICAL FIX: Add circuit breaker to prevent infinite loops
      const noTaskRetryCount =
        (state.memory?.get("noTaskRetryCount") as number) || 0;
      const maxNoTaskRetries = 3; // Allow only 3 attempts to find available tasks

      if (pendingTasks.length > 0) {
        if (noTaskRetryCount >= maxNoTaskRetries) {
          // Circuit breaker activated - mark all pending tasks as failed due to deadlock
          logEvent("error", AgentType.SUPERVISOR, "task_deadlock_detected", {
            pendingTasks: pendingTasks.map((t) => ({
              id: t.id,
              dependencies: t.dependencies,
              description: t.description,
            })),
            retryCount: noTaskRetryCount,
          });

          // Mark all pending tasks as failed to break the deadlock
          const updatedTaskState = {
            ...taskState,
            tasks: taskState.tasks.map((task) =>
              task.status === "pending"
                ? {
                    ...task,
                    status: "failed" as const,
                    error:
                      "Task failed due to dependency deadlock or infinite loop prevention",
                  }
                : task
            ),
            failedTasks: new Set([
              ...taskState.failedTasks,
              ...pendingTasks.map((t) => t.id),
            ]),
          };

          // Clear retry count and end the flow
          const clearedMemory = safeCreateMemoryMap(state.memory);
          clearedMemory.delete("noTaskRetryCount");
          clearedMemory.delete("lastTaskCreationMessage");
          clearedMemory.set("taskState", updatedTaskState);

          return new Command({
            goto: END,
            update: {
              messages: [
                ...state.messages,
                new AIMessage({
                  content:
                    "I encountered a dependency deadlock and had to stop processing. Some tasks could not be completed due to unresolved dependencies.",
                }),
              ],
              memory: clearedMemory,
            },
          });
        }

        logEvent(
          "info",
          AgentType.SUPERVISOR,
          "pending_tasks_exist_with_retry",
          {
            pendingTasks: pendingTasks.map((t) => t.id),
            retryCount: noTaskRetryCount,
          }
        );

        // Increment retry count and try once more
        const newMemory = safeCreateMemoryMap(state.memory);
        newMemory.set("noTaskRetryCount", noTaskRetryCount + 1);

        return new Command({
          goto: AgentType.SUPERVISOR,
          update: {
            messages: state.messages,
            memory: newMemory,
          },
        });
      } else if (inProgressTasks.length > 0) {
        if (noTaskRetryCount >= maxNoTaskRetries) {
          // Circuit breaker for in-progress tasks too
          logEvent("error", AgentType.SUPERVISOR, "in_progress_task_timeout", {
            inProgressTasks: inProgressTasks.map((t) => t.id),
            retryCount: noTaskRetryCount,
          });

          // Mark stuck in-progress tasks as failed
          const updatedTaskState = {
            ...taskState,
            tasks: taskState.tasks.map((task) =>
              task.status === "in_progress"
                ? {
                    ...task,
                    status: "failed" as const,
                    error:
                      "Task failed due to timeout or infinite loop prevention",
                  }
                : task
            ),
            failedTasks: new Set([
              ...taskState.failedTasks,
              ...inProgressTasks.map((t) => t.id),
            ]),
          };

          const clearedMemory = safeCreateMemoryMap(state.memory);
          clearedMemory.delete("noTaskRetryCount");
          clearedMemory.delete("lastTaskCreationMessage");
          clearedMemory.set("taskState", updatedTaskState);

          return new Command({
            goto: END,
            update: {
              messages: [
                ...state.messages,
                new AIMessage({
                  content:
                    "Some tasks took too long to complete and were terminated to prevent infinite loops.",
                }),
              ],
              memory: clearedMemory,
            },
          });
        }

        logEvent(
          "info",
          AgentType.SUPERVISOR,
          "in_progress_tasks_exist_with_retry",
          {
            inProgressTasks: inProgressTasks.map((t) => t.id),
            retryCount: noTaskRetryCount,
          }
        );

        // Increment retry count and wait a bit more
        const newMemory = safeCreateMemoryMap(state.memory);
        newMemory.set("noTaskRetryCount", noTaskRetryCount + 1);

        return new Command({
          goto: AgentType.SUPERVISOR,
          update: {
            messages: state.messages,
            memory: newMemory,
          },
        });
      }
    }

    logEvent("info", AgentType.SUPERVISOR, "no_available_tasks_fallback");

    // Clear task creation tracking to allow fresh conversations
    const clearedMemory = safeCreateMemoryMap(state.memory);
    clearedMemory.delete("lastTaskCreationMessage");

    return new Command({
      goto: END,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: "All tasks have been completed.",
          }),
        ],
        memory: clearedMemory,
      },
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
      .filter((t) => t.status === "pending")
      .map((t) => t.description),
  });

  logEvent("info", AgentType.SUPERVISOR, "direct_transfer_initiated", {
    targetAgent,
    reason,
    currentTask: task,
  });

  // Clear retry count on successful direct transfer
  const finalClearedMemory = safeCreateMemoryMap(state.memory);
  finalClearedMemory.delete("noTaskRetryCount");

  // Direct transfer without going through tool node to avoid recursion
  return new Command({
    goto: targetAgent,
    update: {
      messages: state.messages, // No technical messages
      memory: finalClearedMemory,
    },
  });
};
