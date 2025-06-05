import { Task, TaskState } from '../types';
import { AgentType, AgentState, AgentMessage } from '../types/agents';
import { v4 as uuidv4 } from 'uuid';
import {
  updateTaskState,
  getNextTask,
  updateTaskResult,
  getTaskProgress,
  addSourceToTask,
  updateTaskRequirements,
  createDataRequirement
} from '../tasks/tasks-handling';

/**
 * Creates a new agent message
 */
export function createAgentMessage(
  from: AgentType,
  to: AgentType,
  type: AgentMessage['type'],
  content: any,
  priority: AgentMessage['priority'] = 'medium',
  requiresAck: boolean = false
): AgentMessage {
  return {
    id: uuidv4(),
    from,
    to,
    type,
    content,
    timestamp: new Date().toISOString(),
    priority,
    requiresAck
  };
}

/**
 * Analyzes task requirements
 */
export function analyzeTaskRequirements(task: Task): Task {
  // TODO: Implement actual requirement analysis logic
  const requirements = [
    createDataRequirement(
      'Analyze task description',
      'text',
      true
    ),
    createDataRequirement(
      'Gather relevant context',
      'context',
      true
    )
  ];

  return updateTaskRequirements(task, requirements);
}

/**
 * Executes a query task
 */
export async function executeQueryTask(
  task: Task,
  state: TaskState
): Promise<TaskState> {
  // Analyze requirements
  const updatedTask = analyzeTaskRequirements(task);
  const updatedState = updateTaskState(state, task.id, updatedTask);

  // Check if we have all required data
  const missingRequired = updatedTask.context.dataRequirements.filter(
    req => req.required && req.status !== 'completed'
  );

  if (missingRequired.length > 0) {
    // Update task phase to data gathering
    return updateTaskState(updatedState, task.id, {
      context: {
        ...updatedTask.context,
        phase: 'data_gathering'
      }
    });
  }

  // Execute the task
  try {
    // TODO: Implement actual query execution logic
    const result = { data: 'Query result' };
    return updateTaskResult(updatedState, task.id, result);
  } catch (error) {
    return updateTaskState(updatedState, task.id, {
      status: 'failed',
      error: error.message
    });
  }
}

/**
 * Executes a mutation task
 */
export async function executeMutationTask(
  task: Task,
  state: TaskState
): Promise<TaskState> {
  // Analyze requirements
  const updatedTask = analyzeTaskRequirements(task);
  const updatedState = updateTaskState(state, task.id, updatedTask);

  // Check if we have all required data
  const missingRequired = updatedTask.context.dataRequirements.filter(
    req => req.required && req.status !== 'completed'
  );

  if (missingRequired.length > 0) {
    // Update task phase to data gathering
    return updateTaskState(updatedState, task.id, {
      context: {
        ...updatedTask.context,
        phase: 'data_gathering'
      }
    });
  }

  // Execute the task
  try {
    // TODO: Implement actual mutation execution logic
    const result = { success: true };
    return updateTaskResult(updatedState, task.id, result);
  } catch (error) {
    return updateTaskState(updatedState, task.id, {
      status: 'failed',
      error: error.message
    });
  }
}

/**
 * Handles data gathering for a task
 */
export async function handleDataGathering(
  task: Task,
  state: TaskState
): Promise<TaskState> {
  const requirements = task.context.dataRequirements;
  const updatedRequirements = requirements.map(req => {
    if (req.status === 'pending') {
      // TODO: Implement actual data gathering logic
      return {
        ...req,
        status: 'completed' as const,
        data: { sample: 'data' }
      };
    }
    return req;
  });

  const updatedTask = updateTaskRequirements(task, updatedRequirements);
  return updateTaskState(state, task.id, updatedTask);
}

/**
 * Creates a new agent state
 */
export function createAgentState(type: AgentType): AgentState {
  return {
    type,
    status: 'idle',
    context: {}
  };
}

/**
 * Updates an agent's state
 */
export function updateAgentState(
  state: AgentState,
  updates: Partial<AgentState>
): AgentState {
  return {
    ...state,
    ...updates
  };
} 