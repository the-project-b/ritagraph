import { Task, TaskState, StructuredLog } from '../types';
import { AgentType, AgentMessage } from '../types/agents';

// Re-export ExecutionStateManager for easy imports
export { ExecutionStateManager, executionStateManager, type AgentExecutionState } from './execution-state-manager';

/**
 * Creates a structured log entry
 */
export function createLogEntry(
  level: StructuredLog['level'],
  agent: AgentType,
  event: string,
  details: Record<string, any> = {}
): StructuredLog {
  return {
    timestamp: new Date().toISOString(),
    level,
    agent,
    event,
    details
  };
}

/**
 * Formats a task for logging
 */
export function formatTaskForLog(task: Task): string {
  return `Task ${task.id} (${task.type}): ${task.description}`;
}

/**
 * Formats task progress for logging
 */
export function formatProgressForLog(state: TaskState): string {
  const total = state.tasks?.length ?? 0;
  const completed = state.completedTasks?.size ?? 0;
  const failed = state.failedTasks?.size ?? 0;
  const dataGathering = state.tasks?.filter(
    task => task.context.phase === 'data_gathering'
  )?.length ?? 0;
  const pending = total - completed - failed - dataGathering;

  return `Progress: ${completed}/${total} completed, ${failed} failed, ${dataGathering} gathering data, ${pending} pending`;
}

/**
 * Formats an agent message for logging
 */
export function formatMessageForLog(message: AgentMessage): string {
  return `[${message.from} -> ${message.to}] ${message.type}: ${JSON.stringify(message.content)}`;
}

/**
 * Validates a task's state
 */
export function validateTaskState(state: TaskState): boolean {
  // Check if all completed tasks are in the tasks list
  for (const taskId of state.completedTasks) {
    if (!state.tasks.some(t => t.id === taskId)) {
      return false;
    }
  }

  // Check if all failed tasks are in the tasks list
  for (const taskId of state.failedTasks) {
    if (!state.tasks.some(t => t.id === taskId)) {
      return false;
    }
  }

  // Note: currentTaskIndex was removed in favor of dependency-based task selection
  // No additional validation needed for task selection since it's handled dynamically

  return true;
}

/**
 * Deep clones an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merges two objects deeply
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = deepClone(target);
  
  for (const key in source) {
    const value = source[key];
    if (value && typeof value === 'object' && key in target) {
      output[key] = deepMerge(target[key], value as Partial<T[typeof key]>);
    } else {
      output[key] = value as T[typeof key];
    }
  }
  
  return output;
}

/**
 * Generates a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Delays execution for a specified time
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (retries >= maxRetries) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
      retries++;
    }
  }
} 