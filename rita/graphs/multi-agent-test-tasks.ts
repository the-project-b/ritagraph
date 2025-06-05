import { ExtendedState } from '../states/states';
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

/**
 * Represents a single task in the workflow.
 * @interface Task
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  /** Human-readable description of the task */
  description: string;
  /** Type of operation: query for data retrieval or mutation for data modification */
  type: 'query' | 'mutation';
  /** Target agent that should handle this task */
  targetAgent: 'query_agent' | 'mutation_agent';
  /** List of task IDs that must be completed before this task can start */
  dependencies: string[];
  /** Current execution status of the task */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** Result data from task execution, if completed successfully */
  result?: any;
  /** Error message if task failed */
  error?: string;
}

/**
 * Represents the complete state of all tasks in the workflow.
 * @interface TaskState
 */
export interface TaskState {
  /** List of all tasks in the workflow */
  tasks: Task[];
  /** Index of the current task being processed */
  currentTaskIndex: number;
  /** Set of completed task IDs */
  completedTasks: Set<string>;
  /** Set of failed task IDs */
  failedTasks: Set<string>;
}

/**
 * Keywords that indicate task types and their corresponding target agents
 */
const TASK_KEYWORDS = {
  query: {
    keywords: ['get', 'find', 'retrieve', 'view', 'show', 'list', 'read', 'request', 'fetch', 'search'],
    targetAgent: 'query_agent'
  },
  mutation: {
    keywords: ['create', 'update', 'delete', 'modify', 'change', 'set', 'add', 'remove', 'edit'],
    targetAgent: 'mutation_agent'
  }
} as const;

/**
 * Keywords that indicate task separation
 */
const TASK_SEPARATORS = ['and', 'then', 'after', 'next', 'before', 'while', 'when'] as const;

/**
 * Keywords that indicate task dependencies
 */
const DEPENDENCY_KEYWORDS = ['using', 'with', 'from', 'based on', 'after getting', 'once we have'] as const;

/**
 * Uses LLM to extract tasks from a user request.
 * The LLM will intelligently break down the request into individual tasks,
 * determining their types and dependencies.
 */
async function extractTasksWithLLM(request: string): Promise<Task[]> {
  const model = new ChatOpenAI({
    model: 'gpt-4',
    temperature: 0,
  });

  const prompt = `You are a task extraction assistant. Your job is to break down user requests into individual tasks.
For each task, determine:
1. The task type (query or mutation)
2. The target agent (query_agent or mutation_agent)
3. Any dependencies between tasks

Task Types:
- Query tasks: get, find, retrieve, view, show, list, read, request, fetch, search
- Mutation tasks: create, update, delete, modify, change, set, add, remove, edit

Respond with a JSON array of tasks in this format:
[
  {
    "description": "task description",
    "type": "query" or "mutation",
    "targetAgent": "query_agent" or "mutation_agent",
    "dependencies": ["task_id of dependency"]
  }
]

Example input: "get user info and update his email"
Example output:
[
  {
    "description": "get user info",
    "type": "query",
    "targetAgent": "query_agent",
    "dependencies": []
  },
  {
    "description": "update his email",
    "type": "mutation",
    "targetAgent": "mutation_agent",
    "dependencies": ["task_0"]
  }
]

User request: ${request}`;

  const response = await model.invoke([
    new HumanMessage(prompt)
  ]);

  try {
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    const tasks = JSON.parse(content);
    return tasks.map((task: any, index: number) => ({
      id: `task_${index}`,
      description: task.description,
      type: task.type,
      targetAgent: task.targetAgent,
      dependencies: task.dependencies || [],
      status: 'pending'
    }));
  } catch (error) {
    console.error('Error parsing LLM response:', error);
    // Fallback to basic task extraction if LLM fails
    return extractTasks(request);
  }
}

export const extractTasks = async (request: string): Promise<Task[]> => {
  try {
    return await extractTasksWithLLM(request);
  } catch (error) {
    console.error('Error in LLM task extraction:', error);
    // Fallback to basic task extraction if LLM fails
    return basicExtractTasks(request);
  }
};

// Rename the old extractTasks to basicExtractTasks for fallback
const basicExtractTasks = (request: string): Task[] => {
  const tasks: Task[] = [];
  let currentType: 'query' | 'mutation' | null = null;
  let taskCounter = 0;
  
  // Normalize the request text
  const normalizedRequest = request.toLowerCase().trim();
  
  // Split by task separators while preserving the separators
  const parts = normalizedRequest.split(new RegExp(`\\b(${TASK_SEPARATORS.join('|')})\\b`, 'i'));
  
  // Process each part
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part || TASK_SEPARATORS.includes(part as any)) continue;
    
    // Split by mutation keywords to handle multiple mutation tasks
    const subParts = part.split(/\b(change|update|modify|set)\b/i);
    let currentPart = '';
    
    for (let j = 0; j < subParts.length; j++) {
      const subPart = subParts[j].trim();
      if (!subPart) continue;
      
      // If this is a mutation keyword, start a new part
      if (TASK_KEYWORDS.mutation.keywords.includes(subPart as typeof TASK_KEYWORDS.mutation.keywords[number])) {
        if (currentPart) {
          // Create task for the previous part
          const taskInfo = determineTaskTypeAndAgent(currentPart, currentType);
          currentType = taskInfo.type;
          
          const task: Task = {
            id: `task_${taskCounter++}`,
            description: currentPart,
            type: taskInfo.type,
            targetAgent: taskInfo.targetAgent,
            dependencies: [],
            status: 'pending'
          };
          
          // Add dependencies
          const dependencies = findDependencies(currentPart, tasks);
          if (dependencies.length > 0) {
            task.dependencies.push(...dependencies);
          }
          
          tasks.push(task);
        }
        currentPart = subPart;
      } else {
        // Add to current part
        currentPart = currentPart ? `${currentPart} ${subPart}` : subPart;
      }
    }
    
    // Create task for the last part
    if (currentPart) {
      const taskInfo = determineTaskTypeAndAgent(currentPart, currentType);
      currentType = taskInfo.type;
      
      const task: Task = {
        id: `task_${taskCounter++}`,
        description: currentPart,
        type: taskInfo.type,
        targetAgent: taskInfo.targetAgent,
        dependencies: [],
        status: 'pending'
      };
      
      // Add dependencies
      const dependencies = findDependencies(currentPart, tasks);
      if (dependencies.length > 0) {
        task.dependencies.push(...dependencies);
      }
      
      tasks.push(task);
    }
  }
  
  return tasks;
};

/**
 * Determines the type and target agent of a task based on its description and context.
 * 
 * @param description - The task description
 * @param currentType - The current task type context
 * @returns Object containing the task type and target agent
 */
function determineTaskTypeAndAgent(
  description: string, 
  currentType: 'query' | 'mutation' | null
): { type: 'query' | 'mutation'; targetAgent: 'query_agent' | 'mutation_agent' } {
  // Check for explicit type indicators
  for (const [type, info] of Object.entries(TASK_KEYWORDS)) {
    if (info.keywords.some(keyword => description.includes(keyword))) {
      return {
        type: type as 'query' | 'mutation',
        targetAgent: info.targetAgent
      };
    }
  }
  
  // If no explicit indicators, use context or default to query
  return {
    type: currentType || 'query',
    targetAgent: currentType === 'mutation' ? 'mutation_agent' : 'query_agent'
  };
}

/**
 * Finds dependencies for a task based on its description.
 * 
 * @param description - The task description
 * @param existingTasks - Array of existing tasks
 * @returns Array of task IDs that this task depends on
 */
function findDependencies(description: string, existingTasks: Task[]): string[] {
  const dependencies: string[] = [];
  
  // Check for explicit dependency indicators
  for (const keyword of DEPENDENCY_KEYWORDS) {
    const match = description.match(new RegExp(`${keyword}\\s+([^,.]+)`, 'i'));
    if (match) {
      const dependencyDesc = match[1].trim();
      const dependencyTask = existingTasks.find(t => 
        t.description.includes(dependencyDesc) && 
        !dependencies.includes(t.id)
      );
      if (dependencyTask) {
        dependencies.push(dependencyTask.id);
      }
    }
  }
  
  return dependencies;
}

/**
 * Updates the state with a new set of tasks.
 * Initializes the task state with the provided tasks and resets progress tracking.
 * 
 * @param state - The current state
 * @param tasks - Array of tasks to initialize
 * @returns Updated state with new task state
 */
export const updateTaskState = (state: ExtendedState, tasks: Task[]): ExtendedState => {
  const taskState: TaskState = {
    tasks,
    currentTaskIndex: 0,
    completedTasks: new Set(),
    failedTasks: new Set()
  };
  
  return {
    ...state,
    memory: new Map(state.memory || new Map())
      .set('taskState', taskState)
  };
};

/**
 * Gets the next available task that can be executed.
 * A task is available if all its dependencies are completed and it hasn't failed.
 * 
 * @param state - The current state
 * @returns Object containing the next task and updated state, or null if no tasks are available
 */
export const getNextTask = (state: ExtendedState): { task: Task | null; updatedState: ExtendedState } => {
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) {
    return { task: null, updatedState: state };
  }
  
  const { tasks, currentTaskIndex, completedTasks, failedTasks } = taskState;
  
  // Find the next task whose dependencies are all completed
  const nextTaskIndex = tasks.findIndex((task, index) => {
    // Skip tasks that are already completed or failed
    if (completedTasks.has(task.id) || failedTasks.has(task.id)) return false;
    // Skip tasks before the current index
    if (index < currentTaskIndex) return false;
    // Skip tasks that are not pending
    if (task.status !== 'pending') return false;
    
    // Check if all dependencies are completed
    return task.dependencies.every(depId => completedTasks.has(depId));
  });
  
  if (nextTaskIndex === -1) {
    return { task: null, updatedState: state };
  }
  
  // Update task state
  const updatedTaskState: TaskState = {
    ...taskState,
    currentTaskIndex: nextTaskIndex + 1,
    tasks: taskState.tasks.map((task, index) => 
      index === nextTaskIndex ? { ...task, status: 'in_progress' } : task
    )
  };
  
  const updatedState = {
    ...state,
    memory: new Map(state.memory || new Map())
      .set('taskState', updatedTaskState)
  };
  
  return { task: tasks[nextTaskIndex], updatedState };
};

/**
 * Updates the result of a task execution.
 * Marks the task as completed or failed and stores the result or error.
 * 
 * @param state - The current state
 * @param taskId - ID of the task to update
 * @param result - Result data from successful execution
 * @param error - Error message if execution failed
 * @returns Updated state with task result
 */
export const updateTaskResult = (
  state: ExtendedState,
  taskId: string,
  result: any,
  error?: string
): ExtendedState => {
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) return state;
  
  const { tasks, completedTasks, failedTasks } = taskState;
  
  // Update task status and result
  const updatedTasks = tasks.map(task => {
    if (task.id === taskId) {
      const status: Task['status'] = error ? 'failed' : 'completed';
      return { ...task, status, result, error };
    }
    return task;
  });
  
  // Update completed/failed sets
  const newCompletedTasks = new Set(completedTasks);
  const newFailedTasks = new Set(failedTasks);
  
  if (error) {
    newFailedTasks.add(taskId);
  } else {
    newCompletedTasks.add(taskId);
  }
  
  // Create new task state with updated values
  const updatedTaskState: TaskState = {
    ...taskState,
    tasks: updatedTasks,
    completedTasks: newCompletedTasks,
    failedTasks: newFailedTasks
  };
  
  // Create new memory map with updated task state
  const newMemory = new Map(state.memory || new Map());
  newMemory.set('taskState', updatedTaskState);
  
  // Return new state with updated memory
  return {
    ...state,
    memory: newMemory
  };
};

/**
 * Gets the current progress of all tasks in the workflow.
 * 
 * @param state - The current state
 * @returns Object containing progress statistics and current task
 */
export const getTaskProgress = (state: ExtendedState): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  currentTask?: Task;
} => {
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) {
    return { total: 0, completed: 0, failed: 0, pending: 0 };
  }
  
  const { tasks, currentTaskIndex, completedTasks, failedTasks } = taskState;
  
  // Count tasks by status
  const completed = completedTasks.size;
  const failed = failedTasks.size;
  const pending = tasks.filter(t => 
    !completedTasks.has(t.id) && 
    !failedTasks.has(t.id) && 
    t.status === 'pending'
  ).length;
  
  // Get current task if any
  const currentTask = tasks[currentTaskIndex - 1];
  
  return {
    total: tasks.length,
    completed,
    failed,
    pending,
    currentTask
  };
};
