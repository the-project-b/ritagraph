import { Task, TaskState, DataRequirement, Source, Citation } from "../types";
import { v4 as uuidv4 } from "uuid";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { ExtendedState } from "../../../states/states";
import { executionStateManager } from "../utils/execution-state-manager";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logEvent } from "../agents/supervisor-agent";
import { AgentType } from "../types/agents";
import { BasePromptConfig } from "../prompts/base-prompt-loader";
import { loadTemplatePrompt } from "../prompts/configurable-prompt-resolver";
import { safeCreateMemoryMap } from "../utils/memory-helpers";

/**
 * Creates a new data requirement
 */
export function createDataRequirement(
  description: string,
  dataType: string,
  required: boolean = true
): DataRequirement {
  return {
    id: uuidv4(),
    description,
    dataType,
    required,
    status: "pending",
  };
}

/**
 * Updates a task's data requirements
 */
export function updateTaskRequirements(
  task: Task,
  requirements: DataRequirement[]
): Task {
  return {
    ...task,
    context: {
      ...task.context,
      dataRequirements: requirements,
    },
  };
}

/**
 * Adds a source to a task
 */
export function addSourceToTask(task: Task, source: Source): Task {
  return {
    ...task,
    sources: [...task.sources, source],
  };
}

/**
 * Adds a citation to a task
 */
export function addCitationToTask(task: Task, citation: Citation): Task {
  return {
    ...task,
    citations: [...task.citations, citation],
  };
}

/**
 * Updates a task's state
 * Note: This function only updates the task itself in the tasks array.
 * It does NOT update the completedTasks or failedTasks Sets.
 * If you need to update those Sets, use updateTaskResult or updateTaskProgress instead.
 */
export function updateTaskState(
  state: TaskState,
  taskId: string,
  updates: Partial<Task>
): TaskState {
  const taskIndex = state.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return state;

  const updatedTasks = [...state.tasks];
  updatedTasks[taskIndex] = {
    ...updatedTasks[taskIndex],
    ...updates,
  };

  return {
    ...state,
    tasks: updatedTasks,
  };
}

/**
 * Updates a task's state and maintains the completedTasks/failedTasks Sets
 * Use this when you need to update both the task and its Sets.
 */
export function updateTaskStateWithSets(
  state: TaskState,
  taskId: string,
  updates: Partial<Task>
): TaskState {
  const updatedState = updateTaskState(state, taskId, updates);

  // Update Sets based on task status
  const task = updatedState.tasks.find((t) => t.id === taskId);
  if (!task) return updatedState;

  const updatedCompletedTasks = new Set(updatedState.completedTasks);
  const updatedFailedTasks = new Set(updatedState.failedTasks);

  if (task.status === "completed") {
    updatedCompletedTasks.add(taskId);
    updatedFailedTasks.delete(taskId);
  } else if (task.status === "failed") {
    updatedFailedTasks.add(taskId);
    updatedCompletedTasks.delete(taskId);
  } else {
    updatedCompletedTasks.delete(taskId);
    updatedFailedTasks.delete(taskId);
  }

  return {
    ...updatedState,
    completedTasks: updatedCompletedTasks,
    failedTasks: updatedFailedTasks,
  };
}

/**
 * Detects cycles in task dependencies using DFS
 */
function hasCycle(tasks: Task[]): { hasCycle: boolean; cyclePath?: string[] } {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  function dfs(
    taskId: string,
    path: string[] = []
  ): { hasCycle: boolean; cyclePath?: string[] } {
    if (recursionStack.has(taskId)) {
      // Found a cycle, return the cycle path
      const cycleStart = path.indexOf(taskId);
      return {
        hasCycle: true,
        cyclePath: [...path.slice(cycleStart), taskId],
      };
    }

    if (visited.has(taskId)) {
      return { hasCycle: false };
    }

    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    const task = taskMap.get(taskId);
    if (!task) {
      recursionStack.delete(taskId);
      path.pop();
      return { hasCycle: false };
    }

    for (const depId of task.dependencies) {
      const result = dfs(depId, [...path]);
      if (result.hasCycle) {
        return result;
      }
    }

    recursionStack.delete(taskId);
    path.pop();
    return { hasCycle: false };
  }

  // Check each task for cycles
  for (const task of tasks) {
    if (!visited.has(task.id)) {
      const result = dfs(task.id);
      if (result.hasCycle) {
        return result;
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Gets the next available task that can be executed.
 * A task is available if:
 * 1. It has 'pending' status
 * 2. All its dependencies are completed
 *
 * This function includes comprehensive logging and automatically updates
 * the selected task's status to 'in_progress'.
 */
export function getNextTask(state: ExtendedState): {
  task: Task | null;
  updatedState: ExtendedState;
} {
  const taskState = state.memory?.get("taskState") as TaskState;
  if (!taskState || !taskState.tasks?.length) {
    return { task: null, updatedState: state };
  }

  console.log(
    `🎯 TASK SELECTOR - Looking for next task among ${taskState.tasks.length} tasks`
  );
  console.log(
    `🎯 TASK SELECTOR - Completed tasks:`,
    Array.from(taskState.completedTasks)
  );
  console.log(
    `🎯 TASK SELECTOR - Failed tasks:`,
    Array.from(taskState.failedTasks)
  );

  // Check for cyclic dependencies
  const cycleCheck = hasCycle(taskState.tasks);
  if (cycleCheck.hasCycle) {
    console.error(
      `🚫 TASK SELECTOR - Detected cyclic dependency: ${cycleCheck.cyclePath?.join(
        " → "
      )}`
    );
    // Mark all tasks in the cycle as failed
    const updatedTasks = taskState.tasks.map((task) => {
      if (cycleCheck.cyclePath?.includes(task.id)) {
        return {
          ...task,
          status: "failed" as const,
          error: `Task failed due to cyclic dependency: ${cycleCheck.cyclePath?.join(
            " → "
          )}`,
        };
      }
      return task;
    });

    const updatedTaskState = {
      ...taskState,
      tasks: updatedTasks,
      failedTasks: new Set([
        ...taskState.failedTasks,
        ...(cycleCheck.cyclePath || []),
      ]),
    };

    return {
      task: null,
      updatedState: {
        ...state,
        memory: safeCreateMemoryMap(state.memory).set(
          "taskState",
          updatedTaskState
        ),
      },
    };
  }

  // Find the next available task that:
  // 1. Is pending
  // 2. Has all dependencies completed
  const availableTask = taskState.tasks.find((task) => {
    console.log(
      `🎯 TASK SELECTOR - Checking task ${task.id}: status=${
        task.status
      }, dependencies=[${task.dependencies.join(", ")}]`
    );

    // Only check task status, not the completedTasks Set
    if (task.status !== "pending") {
      console.log(
        `🎯 TASK SELECTOR - Task ${task.id} skipped: status is ${task.status}`
      );
      return false;
    }

    // Check if all dependencies are completed
    const allDependenciesCompleted = task.dependencies.every((depId) => {
      const depTask = taskState.tasks.find((t) => t.id === depId);
      const isCompleted = depTask?.status === "completed";
      console.log(
        `🎯 TASK SELECTOR - Dependency ${depId} completed: ${isCompleted}`
      );
      return isCompleted;
    });

    if (!allDependenciesCompleted) {
      console.log(
        `🎯 TASK SELECTOR - Task ${task.id} skipped: dependencies not completed`
      );
      return false;
    }

    console.log(
      `🎯 TASK SELECTOR - Task ${task.id} is available for execution`
    );
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
    tasks: taskState.tasks.map((task) =>
      task.id === availableTask.id
        ? { ...task, status: "in_progress" as const }
        : task
    ),
  };

  return {
    task: availableTask,
    updatedState: {
      ...state,
      memory: safeCreateMemoryMap(state.memory).set(
        "taskState",
        updatedTaskState
      ),
    },
  };
}

/**
 * Get current task from state
 */
export function getCurrentTask(state: ExtendedState): Task | null {
  const taskState = state.memory?.get("taskState") as TaskState | undefined;
  return (
    taskState?.tasks?.find((task) => task.status === "in_progress") || null
  );
}

/**
 * Check if there are any pending tasks
 */
export function hasPendingTasks(state: ExtendedState): boolean {
  const taskState = state.memory?.get("taskState") as TaskState;
  if (!taskState || !taskState.tasks?.length) {
    return false;
  }

  return taskState.tasks.some((task) => task.status === "pending");
}

/**
 * Get task summary for logging and debugging
 */
export function getTaskSummary(state: ExtendedState): {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
} {
  const taskState = state.memory?.get("taskState") as TaskState;
  if (!taskState || !taskState.tasks?.length) {
    return { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0 };
  }

  const total = taskState.tasks.length;
  const pending = taskState.tasks.filter((t) => t.status === "pending").length;
  const inProgress = taskState.tasks.filter(
    (t) => t.status === "in_progress"
  ).length;
  const completed = taskState.completedTasks.size;
  const failed = taskState.failedTasks.size;

  return { total, pending, inProgress, completed, failed };
}

/**
 * Safely clones a memory Map to avoid shared references
 */
const cloneMemory = (memory?: Map<string, any>): Map<string, any> =>
  new Map(Array.from(memory || new Map()).map(([k, v]) => [k, v]));

/**
 * Updates a task's result
 */
export function updateTaskResult(
  state: TaskState,
  taskId: string,
  result: any
): TaskState {
  // First update the task status and result
  const updatedState = updateTaskStateWithSets(state, taskId, {
    status: "completed",
    result,
  });

  // Clean up any execution states for this completed task
  executionStateManager.clearTaskStates(taskId);

  // Keep existing task statuses (don't reset other in_progress tasks)
  const updatedTasks = updatedState.tasks;

  return {
    ...updatedState,
    tasks: updatedTasks,
  };
}

/**
 * Updates a task's result in the ExtendedState
 */
export function updateTaskResultInState(
  state: ExtendedState,
  taskId: string,
  result: any
): ExtendedState {
  const taskState = state.memory?.get("taskState") as TaskState;
  if (!taskState) return state;

  const updatedTaskState = updateTaskResult(taskState, taskId, result);

  // Create a new memory map with proper cloning
  const newMemory = cloneMemory(state.memory);
  const keysToCleanup = [
    "discoveredQueries",
    "selectedQuery",
    "typeDetails",
    "typeDetailsSummary",
    "queryContext",
    "structuredPatterns",
  ];

  // Remove task-specific data
  keysToCleanup.forEach((key) => {
    if (newMemory.has(key)) {
      console.log(`🧹 Cleaning up memory key: ${key} for task ${taskId}`);
      newMemory.delete(key);
    }
  });

  return {
    ...state,
    memory: newMemory.set("taskState", updatedTaskState),
  };
}

/**
 * Calculates task progress
 */
export function getTaskProgress(state: TaskState) {
  if (!state.tasks.length) {
    return {
      total: 0,
      completed: 0,
      pending: 0,
      failed: 0,
      dataGathering: 0,
    };
  }

  const completed = state.completedTasks.size;
  const failed = state.failedTasks.size;
  const dataGathering = state.tasks.filter(
    (task) => task.context.phase === "data_gathering"
  ).length;
  const pending = state.tasks.length - completed - failed - dataGathering;

  return {
    total: state.tasks.length,
    completed,
    pending,
    failed,
    dataGathering,
  };
}

/**
 * Zod schemas for task validation
 */
const TaskSchema = z.object({
  description: z.string().min(1),
  type: z.enum(["query", "mutation"]),
  targetAgent: z.enum(["query_agent", "mutation_agent"]),
  dependencies: z.array(z.string().regex(/^task_\d+$/)),
});

const TasksArraySchema = z.array(TaskSchema);

/**
 * Zod schema for Task interface validation
 */
const TaskInterfaceSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(["query", "mutation"]),
  targetAgent: z.enum(["query_agent", "mutation_agent"]),
  dependencies: z.array(z.string()),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  sources: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        content: z.any(),
        confidence: z.number().min(0).max(1),
        verificationStatus: z.enum([
          "unverified",
          "verified",
          "needs_verification",
        ]),
      })
    )
    .default([]),
  citations: z
    .array(
      z.object({
        id: z.string(),
        sourceId: z.string(),
        content: z.any(),
        confidence: z.number().min(0).max(1),
        verificationStatus: z.enum([
          "unverified",
          "verified",
          "needs_verification",
        ]),
      })
    )
    .default([]),
  confidence: z.number().min(0).max(1),
  verificationStatus: z.enum(["unverified", "verified", "needs_verification"]),
  context: z.object({
    dataRequirements: z.array(z.any()).default([]),
    phase: z.enum([
      "initialization",
      "data_gathering",
      "execution",
      "completion",
    ]),
    context: z.record(z.any()),
  }),
});

/**
 * Type guard to ensure task has required properties
 */
function isValidTask(task: any): task is Task {
  const result = TaskInterfaceSchema.safeParse(task);
  return result.success;
}

/**
 * Determines if a task's results need verification
 */
export function needsVerification(task: Task): boolean {
  // Validate task structure
  if (!isValidTask(task)) {
    console.error("Invalid task structure:", task);
    return true; // Default to needing verification for invalid tasks
  }

  // Check task confidence
  if (task.confidence < 0.8) {
    return true;
  }

  // Check sources confidence
  if (task.sources.some((source) => source.confidence < 0.7)) {
    return true;
  }

  // Check citations verification status
  if (
    task.citations.some(
      (citation) => citation.verificationStatus === "needs_verification"
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Creates a new task with default values and proper typing
 */
export function createTask({
  id,
  description,
  type,
  targetAgent,
  dependencies = [],
  status = "pending",
  sources = [],
  citations = [],
  confidence = 0.5,
  verificationStatus = "unverified",
  context = {
    dataRequirements: [],
    phase: "initialization",
    context: {},
  },
  result,
  error,
}: {
  id: string;
  description: string;
  type: "query" | "mutation";
  targetAgent: "query_agent" | "mutation_agent";
  dependencies?: string[];
  status?: "pending" | "in_progress" | "completed" | "failed";
  sources?: Source[];
  citations?: Citation[];
  confidence?: number;
  verificationStatus?: "unverified" | "verified" | "needs_verification";
  context?: {
    dataRequirements: DataRequirement[];
    phase: "initialization" | "data_gathering" | "execution" | "completion";
    context: Record<string, any>;
  };
  result?: any;
  error?: string;
}): Task {
  return {
    id,
    description,
    type,
    targetAgent,
    dependencies,
    status,
    sources,
    citations,
    confidence,
    verificationStatus,
    context,
    result,
    error,
  };
}

/**
 * Uses LLM to extract tasks from a user request.
 * The LLM will intelligently break down the request into individual tasks,
 * determining their types and dependencies.
 */
async function extractTasksWithLLM(
  request: string,
  state?: ExtendedState,
  config?: any
): Promise<Task[]> {
  const model = new ChatOpenAI({
    model: "gpt-4o-mini", // Use more reliable model
    temperature: 0,
    maxTokens: 1000, // Add token limit to prevent issues
  });

  // Load the tasks prompt using the new dynamic prompt system
  let prompt: any = ``;
  try {
    const promptConfig: BasePromptConfig = {
      promptId: "sup_tasks",
      model: model,
      extractSystemPrompts: false,
    };

    // Create a temporary state with the request for prompt population
    const promptState = state || {
      messages: [],
      systemMessages: [],
      memory: new Map([["userRequest", request]]),
    };

    // Use the configurable template system

    const templateState = {
      ...promptState,
      accessToken: "",
      systemMessages: [],
      memory: new Map([
        ...Array.from(promptState.memory || new Map()),
        ["userRequest", request],
        ["request", request], // Add request directly to memory for prompt resolution
      ]),
    };

    // Use a mock config with default template fallback
    const templateConfig = {
      configurable: {
        template_tasks: "-/sup_tasks", // Will use fallback if not overridden
        ...promptConfig,
      },
    };

    const promptResult = await loadTemplatePrompt(
      "template_tasks",
      templateState,
      templateConfig,
      model,
      false
    );

    prompt = promptResult.populatedPrompt?.value || "";
    console.log("🔧 TASKS - Successfully loaded dynamic prompt");
    console.log(
      "🔧 TASKS - Prompt preview:",
      typeof prompt === "string"
        ? prompt.substring(0, 200) + "..."
        : "Not a string"
    );
  } catch (error) {
    console.warn("Failed to load sup_tasks prompt from LangSmith:", error);
    // Fallback to a basic but functional prompt
    prompt = `You are a task extraction assistant. Extract tasks from the user request and respond with ONLY a valid JSON array.

For the user request: "${request}"

Respond with a JSON array in this format:
[
  {
    "description": "clear task description",
    "type": "query",
    "targetAgent": "query_agent", 
    "dependencies": []
  }
]

For simple requests like "who am I", create a single query task.`;
  }

  try {
    const response = await model.invoke([new HumanMessage(prompt)]);

    // Check for empty response
    if (!response || !response.content) {
      console.warn(
        "LLM returned empty response, falling back to basic extraction"
      );
      throw new Error("Empty response from LLM");
    }

    // Extract JSON from the response
    let content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Clean up the content to ensure it's valid JSON
    content = content.trim();

    // Check if content is empty after trimming
    if (!content) {
      console.warn(
        "LLM response is empty after trimming, falling back to basic extraction"
      );
      throw new Error("Empty content after trimming");
    }

    // Remove any non-JSON text before the first [
    const startIndex = content.indexOf("[");
    if (startIndex === -1) {
      console.warn(
        "No JSON array found in LLM response, falling back to basic extraction"
      );
      console.log("Raw content:", content);
      throw new Error("No JSON array found in response");
    }

    if (startIndex > 0) {
      content = content.slice(startIndex);
    }

    // Remove any non-JSON text after the last ]
    const endIndex = content.lastIndexOf("]");
    if (endIndex === -1) {
      console.warn(
        "No closing bracket found in LLM response, falling back to basic extraction"
      );
      throw new Error("No closing bracket found in response");
    }

    if (endIndex < content.length - 1) {
      content = content.slice(0, endIndex + 1);
    }

    // Parse and validate the JSON using Zod
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      console.error("Error parsing JSON:", parseError);
      console.log("Raw content:", content);
      throw new Error("Invalid JSON response from LLM");
    }

    // Validate the parsed content against our schema
    const validationResult = TasksArraySchema.safeParse(parsedContent);
    if (!validationResult.success) {
      console.error("Schema validation failed:", validationResult.error);
      console.log("Parsed content:", parsedContent);
      throw new Error("Response does not match expected task schema");
    }

    // Map validated tasks to our Task type
    return validationResult.data.map((task, index) =>
      createTask({
        id: `task_${index}`,
        description: task.description,
        type: task.type,
        targetAgent: task.targetAgent,
        dependencies: task.dependencies,
      })
    );
  } catch (error) {
    console.error("Error in extractTasksWithLLM:", error);
    console.log("User request was:", request);
    // Fallback to basic task extraction if LLM fails
    return basicExtractTasks(request);
  }
}

/**
 * Extracts tasks from a user request using LLM with fallback to basic extraction.
 */
export const extractTasks = async (
  request: string,
  state?: ExtendedState,
  config?: any
): Promise<Task[]> => {
  try {
    return await extractTasksWithLLM(request, state, config);
  } catch (error) {
    console.error("Error in LLM task extraction:", error);
    // Fallback to basic task extraction if LLM fails
    return basicExtractTasks(request);
  }
};

/**
 * Basic task extraction that uses simple sentence splitting.
 * This is a minimal fallback mechanism when LLM extraction fails.
 */
const basicExtractTasks = (request: string): Task[] => {
  console.log(
    "🔧 BASIC_EXTRACT_TASKS - Input request:",
    JSON.stringify(request)
  );
  const tasks: Task[] = [];
  let taskCounter = 0;

  // Normalize the request text
  const normalizedRequest = request.toLowerCase().trim();
  console.log(
    "🔧 BASIC_EXTRACT_TASKS - Normalized request:",
    JSON.stringify(normalizedRequest)
  );
  console.log(
    "🔧 BASIC_EXTRACT_TASKS - Request length:",
    normalizedRequest.length
  );

  // Special handling for email-based employee queries
  const emailEmployeePattern =
    /(.+)\s+(?:of\s+)?employee\s+with\s+email\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = request.match(emailEmployeePattern);

  if (emailMatch) {
    // Create two tasks for email-based employee queries
    const [, action, email] = emailMatch;

    // Task 1: Find employee by email
    const findEmployeeTask = createTask({
      id: `task_${taskCounter++}`,
      description: `find employee with email ${email}`,
      type: "query",
      targetAgent: "query_agent",
      dependencies: [],
      confidence: 0.6, // Medium-high confidence for pattern recognition
    });

    // Task 2: Perform the requested action on that employee
    const actionTask = createTask({
      id: `task_${taskCounter++}`,
      description: `${action.trim()} for the employee`,
      type: "query",
      targetAgent: "query_agent",
      dependencies: ["task_0"],
      confidence: 0.6, // Medium-high confidence for pattern recognition
    });

    tasks.push(findEmployeeTask, actionTask);
    return tasks;
  }

  // If the request is very short or simple, treat it as a single query task
  if (normalizedRequest.length < 20 || !normalizedRequest.includes(" and ")) {
    console.log(
      "🔧 BASIC_EXTRACT_TASKS - Creating single task for short/simple request"
    );
    const task = createTask({
      id: `task_${taskCounter++}`,
      description: request.trim(), // Use original case
      type: "query", // Default to query for simple requests
      targetAgent: "query_agent",
      dependencies: [],
      confidence: 0.5, // Medium confidence for basic extraction
    });

    console.log("🔧 BASIC_EXTRACT_TASKS - Created task:", task);
    tasks.push(task);
    console.log("🔧 BASIC_EXTRACT_TASKS - Returning tasks:", tasks);
    return tasks;
  }

  // Split by common conjunctions and prepositions
  const parts = normalizedRequest.split(
    /\b(and|then|after|next|before|while|when)\b/i
  );

  // Process each part
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();

    // Skip conjunctions and empty parts
    if (
      !part ||
      ["and", "then", "after", "next", "before", "while", "when"].includes(
        part.toLowerCase()
      )
    ) {
      continue;
    }

    // Determine task type based on keywords
    const isMutation =
      /\b(create|update|delete|modify|change|set|add|remove|edit|rename)\b/i.test(
        part
      );
    const taskType = isMutation ? "mutation" : "query";
    const targetAgent = isMutation ? "mutation_agent" : "query_agent";

    // Create a basic task using the helper
    const task = createTask({
      id: `task_${taskCounter++}`,
      description: part,
      type: taskType,
      targetAgent: targetAgent,
      dependencies: taskCounter > 1 ? [`task_${taskCounter - 2}`] : [], // Depend on previous task
      confidence: 0.3, // Lower confidence for basic extraction
    });

    tasks.push(task);
  }

  // If no valid tasks were created, create a single query task
  if (tasks.length === 0) {
    console.log(
      "🔧 BASIC_EXTRACT_TASKS - No tasks created, creating fallback task"
    );
    const task = createTask({
      id: `task_0`,
      description: request.trim(),
      type: "query",
      targetAgent: "query_agent",
      dependencies: [],
      confidence: 0.3,
    });

    console.log("🔧 BASIC_EXTRACT_TASKS - Created fallback task:", task);
    tasks.push(task);
  }

  console.log("🔧 BASIC_EXTRACT_TASKS - Final tasks array:", tasks);
  return tasks;
};

/**
 * Verifies a citation's accuracy
 */
export function verifyCitation(citation: Citation): Citation {
  // TODO: Implement actual verification logic
  return {
    ...citation,
    verificationStatus: "verified",
    confidence: Math.min(citation.confidence + 0.1, 1.0),
  };
}

/**
 * Calculates task confidence based on sources and citations
 */
export function calculateTaskConfidence(task: Task): number {
  if (!task.sources.length && !task.citations.length) {
    return 0.5; // Default confidence for tasks without sources
  }

  // Calculate source confidence (40% weight)
  const sourceConfidence =
    task.sources.length > 0
      ? task.sources.reduce((sum, source) => sum + source.confidence, 0) /
        task.sources.length
      : 0;

  // Calculate citation confidence (60% weight)
  // Give higher weight to verified citations
  const citationConfidence =
    task.citations.length > 0
      ? task.citations.reduce((sum, citation) => {
          const citationWeight =
            citation.verificationStatus === "verified" ? 1.2 : 1.0;
          return sum + citation.confidence * citationWeight;
        }, 0) / task.citations.length
      : 0;

  // Add verification bonus (10% if task is verified)
  const verificationBonus = task.verificationStatus === "verified" ? 0.1 : 0;

  // Calculate final confidence
  return Math.min(
    0.4 * sourceConfidence + 0.6 * citationConfidence + verificationBonus,
    1.0
  );
}

/**
 * Updates the memory with a new task state
 */
export function updateMemoryWithTaskState(
  state: ExtendedState,
  { tasks, executionStartTime }: { tasks: Task[]; executionStartTime?: number }
): ExtendedState {
  return {
    ...state,
    memory: safeCreateMemoryMap(state.memory).set("taskState", {
      tasks,
      completedTasks: new Set<string>(),
      failedTasks: new Set<string>(),
      executionStartTime,
    }),
  };
}

/**
 * Extends existing task state with new tasks while preserving completed/failed tasks
 * This allows building context across multiple user interactions
 */
export function extendTaskStateWithNewTasks(
  state: ExtendedState,
  {
    newTasks,
    executionStartTime,
  }: { newTasks: Task[]; executionStartTime?: number }
): ExtendedState {
  const existingTaskState = state.memory?.get("taskState") as TaskState;

  if (!existingTaskState) {
    // No existing state, but we need to determine if we should continue numbering
    // Check memory for any task-related information that could indicate previous tasks
    let maxFoundTaskId = -1;

    // Check all memory values for task ID references
    if (state.memory) {
      for (const [key, value] of state.memory.entries()) {
        if (typeof value === "string" && value.includes("task_")) {
          // Extract task IDs from strings in memory
          const taskIdMatches = value.match(/task_(\d+)/g);
          if (taskIdMatches) {
            taskIdMatches.forEach((match) => {
              const taskNum = parseInt(match.replace("task_", ""));
              if (!isNaN(taskNum) && taskNum > maxFoundTaskId) {
                maxFoundTaskId = taskNum;
              }
            });
          }
        } else if (typeof value === "object" && value !== null) {
          // Check for task IDs in object properties
          const jsonStr = JSON.stringify(value);
          const taskIdMatches = jsonStr.match(/task_(\d+)/g);
          if (taskIdMatches) {
            taskIdMatches.forEach((match) => {
              const taskNum = parseInt(match.replace("task_", ""));
              if (!isNaN(taskNum) && taskNum > maxFoundTaskId) {
                maxFoundTaskId = taskNum;
              }
            });
          }
        }
      }
    }

    // Start numbering from the next available ID
    const startTaskId = maxFoundTaskId >= 0 ? maxFoundTaskId + 1 : 0;

    // Renumber new tasks starting from the calculated ID
    const renumberedNewTasks = newTasks.map((task, index) => ({
      ...task,
      id: `task_${startTaskId + index}`,
      // Update dependencies to reference new task IDs
      dependencies: task.dependencies.map((depId) => {
        const depIndex = parseInt(depId.replace("task_", ""));
        if (!isNaN(depIndex) && depIndex < newTasks.length) {
          return `task_${startTaskId + depIndex}`;
        }
        return depId;
      }),
    }));

    // Create new task state with properly numbered tasks
    const newTaskState: TaskState = {
      tasks: renumberedNewTasks,
      completedTasks: new Set<string>(),
      failedTasks: new Set<string>(),
      executionStartTime,
    };

    logEvent("info", AgentType.SUPERVISOR, "task_state_created_with_context", {
      maxFoundTaskId,
      startTaskId,
      newTasks: renumberedNewTasks.length,
      taskIds: renumberedNewTasks.map((t) => t.id),
    });

    return {
      ...state,
      memory: safeCreateMemoryMap(state.memory).set("taskState", newTaskState),
    };
  }

  // Generate new task IDs to avoid conflicts
  let maxTaskId = 0;
  existingTaskState.tasks.forEach((task) => {
    const taskNum = parseInt(task.id.replace("task_", ""));
    if (!isNaN(taskNum) && taskNum > maxTaskId) {
      maxTaskId = taskNum;
    }
  });

  // Renumber new tasks to avoid ID conflicts
  const renumberedNewTasks = newTasks.map((task, index) => ({
    ...task,
    id: `task_${maxTaskId + 1 + index}`,
    // Update dependencies to reference new task IDs if they exist
    dependencies: task.dependencies.map((depId) => {
      const depIndex = parseInt(depId.replace("task_", ""));
      if (!isNaN(depIndex) && depIndex < newTasks.length) {
        return `task_${maxTaskId + 1 + depIndex}`;
      }
      return depId; // Keep original if it references existing tasks
    }),
  }));

  // Combine existing and new tasks
  const combinedTasks = [...existingTaskState.tasks, ...renumberedNewTasks];

  // Create extended task state
  const extendedTaskState: TaskState = {
    tasks: combinedTasks,
    completedTasks: existingTaskState.completedTasks,
    failedTasks: existingTaskState.failedTasks,
    executionStartTime:
      executionStartTime || existingTaskState.executionStartTime,
  };

  logEvent("info", AgentType.SUPERVISOR, "task_state_extended", {
    existingTasks: existingTaskState.tasks.length,
    newTasks: renumberedNewTasks.length,
    totalTasks: combinedTasks.length,
    completedTasks: existingTaskState.completedTasks.size,
    failedTasks: existingTaskState.failedTasks.size,
    maxTaskId: maxTaskId,
    newTaskIds: renumberedNewTasks.map((t) => t.id),
  });

  return {
    ...state,
    memory: safeCreateMemoryMap(state.memory).set(
      "taskState",
      extendedTaskState
    ),
  };
}

/**
 * Updates a task's progress in the state
 */
export function updateTaskProgress(
  state: ExtendedState,
  { taskId, result, error }: { taskId: string; result?: any; error?: string }
): ExtendedState {
  const taskState = state.memory?.get("taskState") as TaskState;
  if (!taskState) return state;

  // Use the proper updateTaskStateWithSets function that handles Sets correctly
  const updatedTaskState = error
    ? updateTaskStateWithSets(taskState, taskId, { status: "failed", error })
    : updateTaskResult(taskState, taskId, result);

  return {
    ...state,
    memory: safeCreateMemoryMap(state.memory).set(
      "taskState",
      updatedTaskState
    ),
  };
}

/**
 * Executes a mutation task
 */
export async function executeMutationTask(task: Task) {
  // TODO: Implement actual mutation execution logic
  // This should:
  // 1. Validate task requirements
  // 2. Execute the mutation
  // 3. Verify the changes
  // 4. Handle errors
  const now = new Date();
  return {
    success: true,
    data: `Executed mutation task: ${task.description}`,
    timestamp: now.toISOString(),
    metadata: {
      taskId: task.id,
      type: task.type,
      executionTime: now.toLocaleTimeString(),
      executionDate: now.toLocaleDateString(),
    },
  };
}

/**
 * Create dynamic task management tool
 */
export function createGetNextTaskTool() {
  return tool(
    async ({ action }: { action: string }) => {
      logEvent("info", AgentType.TOOL, "get_next_task_called", { action });
      return `Task selection action: ${action}`;
    },
    {
      name: "get_next_task",
      description:
        "Get the next available task to execute based on dependencies and status",
      schema: z.object({
        action: z
          .string()
          .describe(
            "Action to perform: 'select_next' to get the next available task"
          ),
      }),
    }
  );
}

/**
 * Resets task states while preserving task definitions.
 * Useful for retries or resets, e.g., clearing in-progress/failure states.
 *
 * @param state The current task state to reset
 * @param options Optional configuration for the reset
 * @returns A new task state with reset statuses
 */
export function resetTaskState(
  state: TaskState,
  options: {
    resetCompleted?: boolean; // Whether to reset completed tasks
    resetFailed?: boolean; // Whether to reset failed tasks
    resetInProgress?: boolean; // Whether to reset in-progress tasks
    preserveDependencies?: boolean; // Whether to preserve dependency relationships
  } = {}
): TaskState {
  const {
    resetCompleted = true,
    resetFailed = true,
    resetInProgress = true,
    preserveDependencies = true,
  } = options;

  // Create new sets for tracking task states
  const newCompletedTasks = new Set<string>();
  const newFailedTasks = new Set<string>();

  // Reset tasks based on options
  const updatedTasks = state.tasks.map((task) => {
    // Determine if this task should be reset
    const shouldReset =
      (resetCompleted && task.status === "completed") ||
      (resetFailed && task.status === "failed") ||
      (resetInProgress && task.status === "in_progress");

    if (shouldReset) {
      // Reset task to pending state
      return {
        ...task,
        status: "pending" as const,
        result: undefined,
        error: undefined,
        // Preserve dependencies if requested
        dependencies: preserveDependencies ? task.dependencies : [],
      };
    }

    // Keep task in its current state
    if (task.status === "completed") {
      newCompletedTasks.add(task.id);
    } else if (task.status === "failed") {
      newFailedTasks.add(task.id);
    }

    return task;
  });

  // Clean up execution states for reset tasks
  if (resetCompleted || resetFailed || resetInProgress) {
    state.tasks.forEach((task) => {
      if (
        (resetCompleted && task.status === "completed") ||
        (resetFailed && task.status === "failed") ||
        (resetInProgress && task.status === "in_progress")
      ) {
        executionStateManager.clearTaskStates(task.id);
      }
    });
  }

  return {
    ...state,
    tasks: updatedTasks,
    completedTasks: newCompletedTasks,
    failedTasks: newFailedTasks,
    // Reset execution start time if all tasks are being reset
    executionStartTime:
      resetCompleted && resetFailed && resetInProgress
        ? Date.now()
        : state.executionStartTime,
  };
}

/**
 * Gets context from completed tasks that might be relevant for new tasks
 * This helps provide continuity across conversations
 */
export function getCompletedTasksContext(state: ExtendedState): {
  completedTasks: Task[];
  recentResults: any[];
  userInfo: any;
  availableData: Record<string, any>;
} {
  const taskState = state.memory?.get("taskState") as TaskState;

  if (!taskState) {
    return {
      completedTasks: [],
      recentResults: [],
      userInfo: null,
      availableData: {},
    };
  }

  const completedTasks = taskState.tasks.filter(
    (task) => task.status === "completed"
  );
  const recentResults = completedTasks
    .map((task) => task.result)
    .filter((result) => result !== undefined)
    .slice(-5); // Get last 5 results

  // Extract user info from completed tasks
  let userInfo = null;
  const userInfoTask = completedTasks.find(
    (task) =>
      (task.description.toLowerCase().includes("user") &&
        task.description.toLowerCase().includes("info")) ||
      task.description.toLowerCase().includes("who am i")
  );
  if (userInfoTask && userInfoTask.result) {
    userInfo = userInfoTask.result;
  }

  // Build available data context
  const availableData: Record<string, any> = {};
  completedTasks.forEach((task) => {
    if (task.result && task.result.data) {
      // Use task description as key for context
      const contextKey = task.description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "_");
      availableData[contextKey] = task.result.data;
    }
  });

  return {
    completedTasks,
    recentResults,
    userInfo,
    availableData,
  };
}

/**
 * Clears completed task history while preserving current active tasks
 * Useful when user wants to start fresh or when context becomes too large
 */
export function clearCompletedTaskHistory(state: ExtendedState): ExtendedState {
  const taskState = state.memory?.get("taskState") as TaskState;

  if (!taskState) {
    return state;
  }

  // Keep only pending and in-progress tasks
  const activeTasks = taskState.tasks.filter(
    (task) => task.status === "pending" || task.status === "in_progress"
  );

  const clearedTaskState: TaskState = {
    tasks: activeTasks,
    completedTasks: new Set<string>(),
    failedTasks: new Set<string>(),
    executionStartTime: taskState.executionStartTime,
  };

  logEvent("info", AgentType.SUPERVISOR, "task_history_cleared", {
    previousTotalTasks: taskState.tasks.length,
    remainingActiveTasks: activeTasks.length,
    clearedCompletedTasks: taskState.completedTasks.size,
    clearedFailedTasks: taskState.failedTasks.size,
  });

  return {
    ...state,
    memory: safeCreateMemoryMap(state.memory).set(
      "taskState",
      clearedTaskState
    ),
  };
}
