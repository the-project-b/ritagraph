// Result Formatting Node - Formats operation results using LLM-generated messages
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ExtendedState } from "../../../states/states";
import { logEvent } from "../agents/supervisor-agent";
import { loadTemplatePrompt } from "../prompts/configurable-prompt-resolver";
import {
  getCompletedTasksContext,
  updateTaskStateWithSets,
} from "../tasks/tasks-handling";
import { Task, TaskState } from "../types";
import { AgentType } from "../types/agents";
import { GatheredContext } from "./context-gathering-node";
import { safeCreateMemoryMap } from "../utils/memory-helpers";

// All template-based formatting removed - using LLM generation instead

/**
 * Format context information for display in results
 */
function formatContextInfo(gatheredContext?: GatheredContext): string {
  if (!gatheredContext) {
    return "";
  }

  const sections = [];

  // Context Sources Used - only show meaningful context
  const meaningfulContext = [];
  if (Object.keys(gatheredContext.staticContext).length > 0) {
    const staticKeys = Object.keys(gatheredContext.staticContext).filter(
      (key) => key !== "extractedPatterns"
    );
    if (staticKeys.length > 0) {
      meaningfulContext.push(`📝 Static: ${staticKeys.join(", ")}`);
    }
  }
  if (Object.keys(gatheredContext.userContext).length > 0) {
    meaningfulContext.push(
      `👤 User: ${Object.keys(gatheredContext.userContext).join(", ")}`
    );
  }
  if (
    gatheredContext.dynamicContext.hasRecentResults ||
    gatheredContext.dynamicContext.completedTaskCount > 0
  ) {
    meaningfulContext.push(
      `🔄 Previous tasks: ${gatheredContext.dynamicContext.completedTaskCount} completed`
    );
  }

  if (meaningfulContext.length > 0) {
    sections.push(`### 🎯 Context Used\n${meaningfulContext.join("\n")}`);
  }

  // Parameter Resolution - only show successfully resolved parameters
  if (gatheredContext.resolutionStrategies.length > 0) {
    const successfullyResolved = gatheredContext.resolutionStrategies
      .filter(
        (strategy) => strategy.sources.length > 0 && strategy.confidence > 0.5
      )
      .map((strategy) => {
        const confidence = Math.round(strategy.confidence * 100);
        const sources = strategy.sources.join(", ");
        const requiredIndicator = strategy.required ? "⚠️ " : "";
        return `${requiredIndicator}**${strategy.parameter}**: ${confidence}% (${sources})`;
      });

    if (successfullyResolved.length > 0) {
      sections.push(
        `### 🔧 Parameters Resolved\n${successfullyResolved.join("\n")}`
      );
    }
  }

  // Type Information - only show if we have meaningful type info
  const hasValidTypeInfo =
    gatheredContext.typeContext.requiredParameters.length > 0 ||
    gatheredContext.typeContext.optionalParameters.length > 0;

  if (hasValidTypeInfo) {
    const typeInfo = [];
    if (gatheredContext.typeContext.requiredParameters.length > 0) {
      typeInfo.push(
        `⚠️ Required: ${gatheredContext.typeContext.requiredParameters
          .slice(0, 5)
          .join(", ")}${
          gatheredContext.typeContext.requiredParameters.length > 5 ? "..." : ""
        }`
      );
    }
    if (gatheredContext.typeContext.optionalParameters.length > 0) {
      typeInfo.push(
        `📄 Optional: ${gatheredContext.typeContext.optionalParameters
          .slice(0, 5)
          .join(", ")}${
          gatheredContext.typeContext.optionalParameters.length > 5 ? "..." : ""
        }`
      );
    }
    sections.push(`### 📋 Schema Parameters\n${typeInfo.join("\n")}`);
  }

  // Extracted Patterns Summary - only show meaningful patterns
  const patterns = gatheredContext.extractedPatterns;
  const extractedPatterns = [];
  if (patterns.companyIds.length > 0)
    extractedPatterns.push(
      `🏢 Companies: ${patterns.companyIds.slice(0, 3).join(", ")}${
        patterns.companyIds.length > 3 ? "..." : ""
      }`
    );
  if (patterns.contractIds.length > 0)
    extractedPatterns.push(
      `📋 Contracts: ${patterns.contractIds.slice(0, 3).join(", ")}${
        patterns.contractIds.length > 3 ? "..." : ""
      }`
    );
  if (patterns.employeeIds.length > 0)
    extractedPatterns.push(
      `👥 Employees: ${patterns.employeeIds.slice(0, 3).join(", ")}${
        patterns.employeeIds.length > 3 ? "..." : ""
      }`
    );
  if (patterns.statusFilters.length > 0)
    extractedPatterns.push(`📊 Status: ${patterns.statusFilters.join(", ")}`);
  if (patterns.dateRanges.length > 0) {
    const dateInfo = patterns.dateRanges
      .slice(0, 2)
      .map((range) =>
        range.startDate && range.endDate
          ? `${range.startDate} to ${range.endDate}`
          : range.startDate
          ? `from ${range.startDate}`
          : range.type
      )
      .join(", ");
    extractedPatterns.push(
      `📅 Dates: ${dateInfo}${patterns.dateRanges.length > 2 ? "..." : ""}`
    );
  }

  if (extractedPatterns.length > 0) {
    sections.push(`### 🔍 Extracted Data\n${extractedPatterns.join("\n")}`);
  }

  // If no meaningful context, don't show the section
  if (sections.length === 0) {
    return "";
  }

  return sections.join("\n\n");
}

/**
 * Result Formatting Node - Formats task results using templates
 */
export const resultFormattingNode = async (
  state: ExtendedState,
  config: any
) => {
  const startTime = Date.now();
  logEvent("info", AgentType.TOOL, "result_formatting_start", { startTime });

  try {
    // Get the current task state
    const taskState = state.memory?.get("taskState") as TaskState;
    if (!taskState) {
      throw new Error("No task state found in memory");
    }

    // Get user request with fallback options
    const userRequestFromMemory = state.memory?.get("userRequest") as string;
    const lastProcessedMessage = state.memory?.get(
      "lastProcessedMessage"
    ) as string;
    const userRequestFromMessages = (
      state.messages && state.messages.length > 0
        ? state.messages
            .filter((msg) => msg.constructor.name === "HumanMessage")
            .map((msg) => msg.content)
            .pop()
        : ""
    ) as string;

    const userRequest =
      userRequestFromMemory || lastProcessedMessage || userRequestFromMessages;

    console.log("🔧 RESULT_FORMATTING - UserRequest sources:", {
      fromMemory: userRequestFromMemory || "EMPTY",
      fromLastProcessed: lastProcessedMessage || "EMPTY",
      fromMessages: userRequestFromMessages || "EMPTY",
      final: userRequest || "EMPTY",
      memoryKeys: state.memory ? Array.from(state.memory.keys()) : [],
    });

    // Get the current task
    const currentTaskIndex = taskState.tasks.findIndex(
      (task) => task.status === "in_progress"
    );
    const currentTask: Task = taskState.tasks[currentTaskIndex];
    if (!currentTask) {
      throw new Error("No active task found");
    }

    logEvent("info", AgentType.TOOL, "formatting_result", {
      taskId: currentTask.id,
      taskType: currentTask.type,
      hasResult: !!currentTask.result,
      userRequest: userRequest?.substring(0, 100) || "N/A",
      hasUserRequest: !!userRequest,
    });

    // Get the result data
    let resultData = currentTask.queryDetails?.queryResult;

    // If result data is a string, try to parse it
    if (typeof resultData === "string") {
      try {
        resultData = JSON.parse(resultData);
      } catch (parseError) {
        logEvent("warn", AgentType.TOOL, "result_formatting_parse_error", {
          error: parseError.message,
          taskId: currentTask.id,
          dataType: typeof resultData,
        });
      }
    }

    // Update task status to completed
    const updatedTaskState = updateTaskStateWithSets(
      taskState,
      currentTask.id,
      {
        status: "completed",
        result: {
          data: resultData,
          metadata: {
            executionTime: Date.now() - startTime,
            taskId: currentTask.id,
          },
        },
      }
    );

    const updatedState = {
      ...state,
      memory: safeCreateMemoryMap(state.memory).set(
        "taskState",
        updatedTaskState
      ),
    };

    // Generate LLM completion message
    const completionMessage = await generateTaskCompletionMessage(
      updatedState.memory.get("taskState") as TaskState,
      currentTaskIndex,
      updatedState,
      config
    );

    logEvent("info", AgentType.TOOL, "result_formatting_completed", {
      taskId: currentTask.id,
      success: !currentTask.error,
      duration: Date.now() - startTime,
    });

    // If this is the last task, end the flow
    const progress = {
      completed: updatedTaskState.completedTasks.size,
      failed: updatedTaskState.tasks.filter((t) => t.status === "failed")
        .length,
      total: updatedTaskState.tasks.length,
    };

    if (progress.completed + progress.failed === progress.total) {
      return new Command({
        goto: "END",
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: completionMessage,
            }),
          ],
          memory: updatedState.memory,
        },
      });
    }

    // Otherwise, continue to supervisor
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: completionMessage,
          }),
        ],
        memory: updatedState.memory,
      },
    });
  } catch (error) {
    logEvent("error", AgentType.TOOL, "result_formatting_error", {
      error: error.message,
      duration: Date.now() - startTime,
    });

    // CRITICAL FIX: Don't throw errors, mark task as failed and continue
    const taskState = state.memory?.get("taskState");
    const currentTaskIndex = taskState?.tasks.findIndex(
      (task) => task.status === "in_progress"
    );

    if (currentTaskIndex >= 0 && taskState) {
      const currentTask = taskState.tasks[currentTaskIndex];
      const updatedTaskState = {
        ...taskState,
        tasks: taskState.tasks.map((task) =>
          task.id === currentTask.id
            ? {
                ...task,
                status: "failed" as const,
                error: `Result formatting failed: ${error.message}`,
              }
            : task
        ),
        failedTasks: new Set([...taskState.failedTasks, currentTask.id]),
      };

      const updatedMemory = safeCreateMemoryMap(state.memory);
      updatedMemory.set("taskState", updatedTaskState);

      // Preserve userRequest
      const userRequest = state.memory?.get("userRequest");
      if (userRequest) {
        updatedMemory.set("userRequest", userRequest);
      }

      return new Command({
        goto: AgentType.SUPERVISOR,
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: `I encountered an error while formatting the results: ${error.message}`,
            }),
          ],
          memory: updatedMemory,
        },
      });
    }

    // Fallback: if no task state, still don't throw
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: `Result formatting failed: ${error.message}`,
          }),
        ],
        memory: state.memory,
      },
    });
  }
};

/**
 * LLM-POWERED TASK COMPLETION MESSAGE GENERATOR
 * Uses AI to generate natural, contextual completion messages for all scenarios:
 * 1. Single Task
 * 2. Multi-Task (Individual completion)
 * 3. Multi-Task (Final summary)
 */
async function generateTaskCompletionMessage(
  taskState: TaskState,
  currentTaskIndex: number,
  state?: ExtendedState,
  config?: any
): Promise<string> {
  const completedTasks = taskState.tasks.filter(
    (task) => task.status === "completed"
  );
  const failedTasks = taskState.tasks.filter(
    (task) => task.status === "failed"
  );
  const totalTasks = taskState.tasks.length;
  const currentTask = taskState.tasks[currentTaskIndex];

  // Get context if state is provided
  let context: ReturnType<typeof getCompletedTasksContext> | null = null;
  if (state) {
    context = getCompletedTasksContext(state);
  }

  // Determine completion scenario
  const isLastTask = completedTasks.length + failedTasks.length === totalTasks;
  const isSingleTask = totalTasks === 1;
  const isIndividualCompletion = !isLastTask || isSingleTask;

  // Get user request for context
  const userRequestFromMemory = state?.memory?.get("userRequest") as string;
  const lastProcessedMessage = state?.memory?.get(
    "lastProcessedMessage"
  ) as string;
  const userRequestFromMessages = (
    state?.messages && state.messages.length > 0
      ? state.messages
          .filter((msg) => msg.constructor.name === "HumanMessage")
          .map((msg) => msg.content)
          .pop()
      : ""
  ) as string;

  const userRequest =
    userRequestFromMemory || lastProcessedMessage || userRequestFromMessages;

  console.log("🔧 GENERATE_MESSAGE - UserRequest sources:", {
    fromMemory: userRequestFromMemory || "EMPTY",
    fromLastProcessed: lastProcessedMessage || "EMPTY",
    fromMessages: userRequestFromMessages || "EMPTY",
    final: userRequest || "EMPTY",
    hasState: !!state,
    hasMemory: !!state?.memory,
  });

  // Prepare simplified data for LLM
  const messageData = {
    scenario: isSingleTask
      ? "SINGLE_TASK"
      : isIndividualCompletion
      ? "INDIVIDUAL_COMPLETION"
      : "FINAL_SUMMARY",
    currentTask,
    taskState: {
      totalTasks,
      completedCount: completedTasks.length,
      failedCount: failedTasks.length,
      currentTaskNumber: parseInt(currentTask.id.replace("task_", "")) + 1,
    },
    allTasks: isLastTask ? taskState.tasks : null,
    context,
    executionTime: taskState.executionStartTime
      ? Math.round((Date.now() - taskState.executionStartTime) / 1000)
      : null,
    userRequest: userRequest || "User request not available",
  };

  return await generateMessageWithLLM(messageData, state, config);
}

/**
 * Generate completion message using LLM
 */
async function generateMessageWithLLM(
  messageData: any,
  state?: ExtendedState,
  config?: any
): Promise<string> {
  const model = new ChatOpenAI({ model: "gpt-4.1", temperature: 0 });

  // Prepare data for the prompt
  const taskStatus = messageData.currentTask.error ? "FAILED" : "COMPLETED";
  const resultData = messageData.currentTask.result?.data
    ? JSON.stringify(messageData.currentTask.result.data, null, 2)
    : "No result";
  const errorInfo = messageData.currentTask.error
    ? `ERROR: ${messageData.currentTask.error}`
    : "";
  const allTasksInfo = messageData.allTasks
    ? messageData.allTasks
        .map((task) => `- ${task.description} (${task.status})`)
        .join("\n")
    : "";
  const contextInfo = messageData.currentTask.context?.gatheredContext
    ? formatContextInfo(messageData.currentTask.context.gatheredContext)
    : "None";
  const executionTimeInfo = messageData.executionTime
    ? `${messageData.executionTime}s`
    : "";

  // Load the result formatting prompt using configurable template system
  let prompt = "";
  try {
    if (state && config) {
      // CRITICAL FIX: Store template-specific data in temporary keys, don't overwrite real taskState
      state.memory?.set("templateTaskState", {
        tasks: [messageData.currentTask],
        completedTasks: new Set(),
        failedTasks: new Set(),
        executionStartTime: Date.now(),
      });
      state.memory?.set(
        "gatheredContext",
        messageData.context?.gatheredContext
      );
      state.memory?.set("scenario", messageData.scenario);
      state.memory?.set(
        "taskStatus",
        messageData.currentTask.error ? "FAILED" : "COMPLETED"
      );
      state.memory?.set("resultData", messageData.currentTask.result?.data);
      state.memory?.set(
        "contextInfo",
        messageData.currentTask.context?.gatheredContext
          ? formatContextInfo(messageData.currentTask.context.gatheredContext)
          : "None"
      );
      state.memory?.set("executionTime", messageData.executionTime);

      const promptResult = await loadTemplatePrompt(
        "template_result_formatting",
        state,
        config,
        model,
        false
      );

      prompt = promptResult.populatedPrompt?.value || "";
      console.log(
        "🔧 RESULT FORMATTING - Successfully loaded configurable template prompt"
      );

      // Clean up temporary template data to avoid memory pollution
      state.memory?.delete("templateTaskState");
      state.memory?.delete("scenario");
      state.memory?.delete("taskStatus");
      state.memory?.delete("resultData");
      state.memory?.delete("contextInfo");
      state.memory?.delete("executionTime");
    } else {
      throw new Error("State or config not provided");
    }
  } catch (error) {
    console.warn("Failed to load result formatting template prompt:", error);
    // Fallback to default prompt
    prompt = `Generate a natural task completion message.

USER REQUEST: ${messageData.userRequest}
SCENARIO: ${messageData.scenario}
TASK: ${messageData.currentTask.description} (${taskStatus})
PROGRESS: ${messageData.taskState.currentTaskNumber}/${
      messageData.taskState.totalTasks
    }

RESULT: ${resultData}
${errorInfo}

${allTasksInfo ? `ALL TASKS:\n${allTasksInfo}` : ""}

CONTEXT: ${contextInfo}
EXECUTION TIME: ${executionTimeInfo}

Generate a user-friendly completion message that:
1. Acknowledges the task completion 
2. References the original user request
3. Summarizes the key results
4. Provides context about progress if multiple tasks
5. Uses a conversational, helpful tone

Keep the message concise but informative and ensure it directly addresses the user's original question.`;
  }

  try {
    const response = await model.invoke([new HumanMessage(prompt)]);
    return typeof response.content === "string"
      ? response.content.trim()
      : JSON.stringify(response.content);
  } catch (error) {
    console.error("LLM message generation failed:", error);
    // Fallback to simple message
    return generateFallbackMessage(messageData);
  }
}

/**
 * Fallback message generator when LLM fails
 */
function generateFallbackMessage(messageData: any): string {
  if (messageData.currentTask.error) {
    return `❌ Task failed: ${messageData.currentTask.error}`;
  }

  const result =
    messageData.currentTask.result?.data ||
    `Task ${messageData.currentTask.id} completed successfully.`;

  if (messageData.scenario === "FINAL_SUMMARY") {
    return `✅ All operations completed: ${messageData.taskState.completedCount} succeeded, ${messageData.taskState.failedCount} failed`;
  } else if (messageData.scenario === "INDIVIDUAL_COMPLETION") {
    return `${result}\n\n📋 Task ${messageData.taskState.currentTaskNumber}/${messageData.taskState.totalTasks} completed`;
  }

  return result;
}

// All manual message generation functions removed - now using LLM-powered generation
