import { Task, TaskState, DataRequirement, Source, Citation } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { ExtendedState } from '../../../states/states';
import { createQueryAgent } from '../agents/query-agent';
import { createTypeDetailsAgent } from '../agents/type-details-agent';
import { executionStateManager } from '../utils/execution-state-manager';

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
    status: 'pending'
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
      dataRequirements: requirements
    }
  };
}

/**
 * Adds a source to a task
 */
export function addSourceToTask(task: Task, source: Source): Task {
  return {
    ...task,
    sources: [...task.sources, source]
  };
}

/**
 * Adds a citation to a task
 */
export function addCitationToTask(task: Task, citation: Citation): Task {
  return {
    ...task,
    citations: [...task.citations, citation]
  };
}

/**
 * Updates a task's state
 */
export function updateTaskState(
  state: TaskState,
  taskId: string,
  updates: Partial<Task>
): TaskState {
  const taskIndex = state.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return state;

  const updatedTasks = [...state.tasks];
  updatedTasks[taskIndex] = {
    ...updatedTasks[taskIndex],
    ...updates
  };

  return {
    ...state,
    tasks: updatedTasks
  };
}

/**
 * Gets the next available task
 */
export function getNextTask(state: TaskState): Task | null {
  const availableTasks = state.tasks?.filter(task => {
    if (task.status !== 'pending') return false;
    return task.dependencies.every(depId => 
      state.completedTasks.has(depId)
    );
  });

  return availableTasks?.[0] || null;
}

/**
 * Updates a task's result
 */
export function updateTaskResult(
  state: TaskState,
  taskId: string,
  result: any
): TaskState {
  // First update the task status and result
  const updatedState = updateTaskState(state, taskId, {
    status: 'completed',
    result
  });
  
  // Then update the completedTasks Set to track dependencies properly
  const updatedCompletedTasks = new Set(state.completedTasks);
  updatedCompletedTasks.add(taskId);
  
  // Remove from failedTasks if it was there
  const updatedFailedTasks = new Set(state.failedTasks);
  updatedFailedTasks.delete(taskId);
  
  // Clean up any execution states for this completed task
  executionStateManager.clearTaskStates(taskId);
  
  return {
    ...updatedState,
    completedTasks: updatedCompletedTasks,
    failedTasks: updatedFailedTasks
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
      dataGathering: 0
    };
  }

  const completed = state.completedTasks.size;
  const failed = state.failedTasks.size;
  const dataGathering = state.tasks.filter(
    task => task.context.phase === 'data_gathering'
  ).length;
  const pending = state.tasks.length - completed - failed - dataGathering;

  return {
    total: state.tasks.length,
    completed,
    pending,
    failed,
    dataGathering
  };
}

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
IMPORTANT: You must respond with ONLY a valid JSON array, no other text or explanation.

For each task, determine:
1. The task type (query or mutation)
2. The target agent (query_agent or mutation_agent)
3. Any dependencies between tasks
4. The task description should be clear and actionable

Task Types and Keywords:
- Query tasks (query_agent):
  * Keywords: get, find, retrieve, view, show, list, read, request, fetch, search
  * Examples: "get user info", "find all orders", "list available products"
  * Purpose: Retrieving or viewing data without modifying it

- Mutation tasks (mutation_agent):
  * Keywords: create, update, delete, modify, change, set, add, remove, edit
  * Examples: "update user email", "create new order", "delete old records"
  * Purpose: Modifying, creating, or deleting data

- Type Details tasks (type_details_agent):
  * Keywords: analyze types, get type details, understand schema, introspect types
  * Examples: "analyze GraphQL types for employee query", "get type details for input types"
  * Purpose: GraphQL schema introspection and type analysis
  * Note: These are often automatically created as dependencies for complex queries

Dependency Rules:
1. Tasks that need data from other tasks should depend on those tasks
2. Use task IDs (task_0, task_1, etc.) to reference dependencies
3. Dependencies should be listed in the order they need to be completed
4. Each task should have a clear, actionable description
5. Tasks should be broken down into the smallest meaningful units

Your response must be a JSON array in this exact format:
[
  {
    "description": "clear and actionable task description",
    "type": "query" or "mutation" or "type_details",
    "targetAgent": "query_agent" or "mutation_agent" or "type_details_agent",
    "dependencies": ["task_id of dependency"]
  }
]

IMPORTANT: For complex data retrieval that likely involves GraphQL types with "Input", "Filter", "Advanced", or other complex naming patterns, automatically create a type_details task as a dependency. For example:
- "get employees with advanced filtering" should create both a type_details task and a query task
- "retrieve user data with complex criteria" should include type analysis

Examples:

Input: "get user info and update their email"
Output:
[
  {
    "description": "get user information",
    "type": "query",
    "targetAgent": "query_agent",
    "dependencies": []
  },
  {
    "description": "update user email address",
    "type": "mutation",
    "targetAgent": "mutation_agent",
    "dependencies": ["task_0"]
  }
]

Input: "find all orders from last month and create a report"
Output:
[
  {
    "description": "retrieve orders from last month",
    "type": "query",
    "targetAgent": "query_agent",
    "dependencies": []
  },
  {
    "description": "generate report from order data",
    "type": "mutation",
    "targetAgent": "mutation_agent",
    "dependencies": ["task_0"]
  }
]

User request: ${request}

Remember: 
1. Respond with ONLY the JSON array, no other text
2. Make task descriptions clear and actionable
3. Include all necessary dependencies
4. Use the correct task type and agent for each task
5. Break down complex tasks into smaller units
6. Ensure each task has a single, clear purpose`;

  try {
    const response = await model.invoke([
      new HumanMessage(prompt)
    ]);

    // Extract JSON from the response
    let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    
    // Clean up the content to ensure it's valid JSON
    content = content.trim();
    
    // Remove any non-JSON text before the first [
    const startIndex = content.indexOf('[');
    if (startIndex > 0) {
      content = content.slice(startIndex);
    }
    
    // Remove any non-JSON text after the last ]
    const endIndex = content.lastIndexOf(']');
    if (endIndex < content.length - 1) {
      content = content.slice(0, endIndex + 1);
    }

    // Try to parse the JSON
    let tasks;
    try {
      tasks = JSON.parse(content);
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);
      console.log('Raw content:', content);
      throw new Error('Invalid JSON response from LLM');
    }
    
    // Validate the tasks array
    if (!Array.isArray(tasks)) {
      throw new Error('Response is not an array');
    }

    // Map and validate each task
    return tasks.map((task: any, index: number) => {
      // Validate required fields
      if (!task.description || !task.type || !task.targetAgent) {
        throw new Error(`Task ${index} is missing required fields`);
      }

      // Validate task type
      if (!['query', 'mutation', 'type_details'].includes(task.type)) {
        throw new Error(`Task ${index} has invalid type: ${task.type}`);
      }

      // Validate target agent
      if (!['query_agent', 'mutation_agent', 'type_details_agent'].includes(task.targetAgent)) {
        throw new Error(`Task ${index} has invalid target agent: ${task.targetAgent}`);
      }

      // Validate dependencies
      if (!Array.isArray(task.dependencies)) {
        throw new Error(`Task ${index} has invalid dependencies format`);
      }

      // Validate dependency references
      task.dependencies.forEach((depId: string) => {
        if (!depId.startsWith('task_') || isNaN(parseInt(depId.slice(5)))) {
          throw new Error(`Task ${index} has invalid dependency reference: ${depId}`);
        }
      });

      return {
        id: `task_${index}`,
        description: task.description,
        type: task.type,
        targetAgent: task.targetAgent,
        dependencies: task.dependencies,
        status: 'pending',
        sources: [],
        citations: [],
        confidence: 0.5,
        verificationStatus: 'unverified',
        context: {
          dataRequirements: [],
          phase: 'initialization',
          context: {}
        }
      };
    });
  } catch (error) {
    console.error('Error in extractTasksWithLLM:', error);
    // Fallback to basic task extraction if LLM fails
    return basicExtractTasks(request);
  }
}

/**
 * Extracts tasks from a user request using LLM with fallback to basic extraction.
 */
export const extractTasks = async (request: string): Promise<Task[]> => {
  try {
    return await extractTasksWithLLM(request);
  } catch (error) {
    console.error('Error in LLM task extraction:', error);
    // Fallback to basic task extraction if LLM fails
    return basicExtractTasks(request);
  }
};

/**
 * Basic task extraction that uses simple sentence splitting.
 * This is a minimal fallback mechanism when LLM extraction fails.
 */
const basicExtractTasks = (request: string): Task[] => {
  const tasks: Task[] = [];
  let taskCounter = 0;
  
  // Normalize the request text
  const normalizedRequest = request.toLowerCase().trim();
  
  // Split by common conjunctions and prepositions
  const parts = normalizedRequest.split(/\b(and|then|after|next|before|while|when)\b/i);
  
  // Process each part
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    
    // Create a basic task
    const task: Task = {
      id: `task_${taskCounter++}`,
      description: part,
      // Default to query type for safety
      type: 'query',
      targetAgent: 'query_agent',
      dependencies: [],
      status: 'pending',
      sources: [],
      citations: [],
      confidence: 0.3, // Lower confidence for basic extraction
      verificationStatus: 'unverified',
      context: {
        dataRequirements: [],
        phase: 'initialization',
        context: {}
      }
    };
    
    // Add dependencies based on order
    if (i > 0) {
      task.dependencies.push(`task_${i - 1}`);
    }
    
    tasks.push(task);
  }
  
  return tasks;
};

/**
 * Verifies a citation's accuracy
 */
export function verifyCitation(citation: Citation): Citation {
  // TODO: Implement actual verification logic
  return {
    ...citation,
    verificationStatus: 'verified',
    confidence: Math.min(citation.confidence + 0.1, 1.0)
  };
}

/**
 * Calculates task confidence based on sources and citations
 */
export function calculateTaskConfidence(task: Task): number {
  if (!task.sources.length && !task.citations.length) {
    return 0.5; // Default confidence for tasks without sources
  }

  const sourceConfidence = task.sources.reduce(
    (sum, source) => sum + source.confidence,
    0
  ) / Math.max(task.sources.length, 1);

  const citationConfidence = task.citations.reduce(
    (sum, citation) => sum + citation.confidence,
    0
  ) / Math.max(task.citations.length, 1);

  return (sourceConfidence + citationConfidence) / 2;
}

/**
 * Determines if a task's results need verification
 */
export function needsVerification(task: Task): boolean {
  return (
    task.confidence < 0.8 ||
    task.sources.some(s => s.confidence < 0.7) ||
    task.citations.some(c => c.verificationStatus === 'needs_verification')
  );
}

/**
 * Updates the memory with a new task state
 */
export function updateMemoryWithTaskState(state: ExtendedState, { tasks, executionStartTime }: { tasks: Task[]; executionStartTime?: number }): ExtendedState {
  return {
    ...state,
    memory: new Map(state.memory || new Map()).set("taskState", {
      tasks,
      completedTasks: new Set<string>(),
      failedTasks: new Set<string>(),
      executionStartTime
    })
  };
}

/**
 * Updates a task's progress in the state
 */
export function updateTaskProgress(
  state: ExtendedState,
  { taskId, result, error }: { taskId: string; result?: any; error?: string }
): ExtendedState {
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) return state;

  // Use the proper updateTaskResult function that handles Sets correctly
  const updatedTaskState = error 
    ? updateTaskState(taskState, taskId, { status: 'failed', error })
    : updateTaskResult(taskState, taskId, result);
  
  // Handle failed tasks Set for error case
  if (error) {
    const updatedFailedTasks = new Set(updatedTaskState.failedTasks);
    updatedFailedTasks.add(taskId);
    
    const updatedCompletedTasks = new Set(updatedTaskState.completedTasks);
    updatedCompletedTasks.delete(taskId);
    
    return {
      ...state,
      memory: new Map(state.memory || new Map()).set("taskState", {
        ...updatedTaskState,
        completedTasks: updatedCompletedTasks,
        failedTasks: updatedFailedTasks
      })
    };
  }

  return {
    ...state,
    memory: new Map(state.memory || new Map()).set("taskState", updatedTaskState)
  };
}

/**
 * Updates the current task index in the state
 */
// Note: updateCurrentTask is no longer needed with dependency-based task selection
// export function updateCurrentTask(state: ExtendedState, { taskIndex }: { taskIndex: number }): ExtendedState {
//   // This function is deprecated - we now use dependency-based task selection
//   return state;
// }

/**
 * Updates a task's result in the ExtendedState
 */
export function updateTaskResultInState(state: ExtendedState, taskId: string, result: any): ExtendedState {
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) return state;

  const updatedTaskState = updateTaskResult(taskState, taskId, result);
  return {
    ...state,
    memory: new Map(state.memory || new Map()).set('taskState', updatedTaskState)
  };
}

/**
 * Executes a query task
 */
export async function executeQueryTask(task: Task, state: any, config: any) {
  try {
    // Create query agent
    const queryAgent = await createQueryAgent();
    
    // Execute the task using the query agent
    const result = await queryAgent.executeTask(task, state, config);
    
    // Add timestamp and format the response
    const now = new Date();
    return {
      ...result,
      timestamp: now.toISOString(),
      metadata: {
        ...result.metadata,
        executionTime: now.toLocaleTimeString(),
        executionDate: now.toLocaleDateString()
      }
    };
  } catch (error) {
    console.error('Error in executeQueryTask:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      metadata: {
        taskId: task.id,
        type: task.type,
        error: error.stack
      }
    };
  }
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
      executionDate: now.toLocaleDateString()
    }
  };
}

/**
 * Executes a type details task
 */
export async function executeTypeDetailsTask(task: Task, state: any, config: any) {
  try {
    // Create type details agent
    const typeDetailsAgent = await createTypeDetailsAgent();
    
    // Execute the task using the type details agent
    const result = await typeDetailsAgent.executeTask(task, state, config);
    
    // Add timestamp and format the response
    const now = new Date();
    return {
      ...result,
      timestamp: now.toISOString(),
      metadata: {
        ...result.metadata,
        executionTime: now.toLocaleTimeString(),
        executionDate: now.toLocaleDateString()
      }
    };
  } catch (error) {
    console.error('Error in executeTypeDetailsTask:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      metadata: {
        taskId: task.id,
        type: task.type,
        error: error.stack
      }
    };
  }
}

/**
 * Creates a type details task for the given type names
 */
export function createTypeDetailsTask(typeNames: string[], dependentTaskId: string): Task {
  const typeDetailsTaskId = `${dependentTaskId}_type_details`;
  
  return {
    id: typeDetailsTaskId,
    description: `Analyze GraphQL types: ${typeNames.join(', ')}`,
    type: 'type_details',
    targetAgent: 'type_details_agent',
    dependencies: [],
    status: 'pending',
    sources: [],
    citations: [],
    confidence: 0.8,
    verificationStatus: 'unverified',
    context: {
      dataRequirements: [],
      phase: 'initialization',
      context: {
        typeNames: typeNames,
        requestedFor: dependentTaskId
      }
    }
  };
}

/**
 * Injects type details tasks when a query indicates it needs them
 */
export function injectTypeDetailsTaskIfNeeded(
  state: ExtendedState,
  taskId: string,
  result: any
): ExtendedState {
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) return state;

  // Check if the result indicates type details are needed
  if (result && result.requiresTypeDetails && result.typeNames) {
    console.log(`🔍 TASK HANDLER - Creating type details task for: ${result.typeNames.join(', ')}`);
    
    // Create a new type details task
    const typeDetailsTask = createTypeDetailsTask(result.typeNames, taskId);
    
    // Find the current task that needs type details
    const currentTaskIndex = taskState.tasks.findIndex(t => t.id === taskId);
    if (currentTaskIndex === -1) return state;
    
    // Update the current task to depend on the type details task
    const updatedTasks = [...taskState.tasks];
    updatedTasks[currentTaskIndex] = {
      ...updatedTasks[currentTaskIndex],
      dependencies: [...updatedTasks[currentTaskIndex].dependencies, typeDetailsTask.id],
      status: 'pending' // Reset to pending since it now has new dependencies
    };
    
    // Insert the type details task before the current task
    updatedTasks.splice(currentTaskIndex, 0, typeDetailsTask);
    
    // Update the task state - remove currentTaskIndex since we now use dependency-based selection
    const updatedTaskState = {
      ...taskState,
      tasks: updatedTasks,
      // Remove the completed/failed status for the current task since it now has new dependencies
      completedTasks: new Set(Array.from(taskState.completedTasks).filter(id => id !== taskId)),
      failedTasks: new Set(Array.from(taskState.failedTasks).filter(id => id !== taskId))
    };
    
    console.log(`🔍 TASK HANDLER - Injected type details task: ${typeDetailsTask.id}`);
    console.log(`🔍 TASK HANDLER - Updated task ${taskId} dependencies:`, updatedTasks[currentTaskIndex + 1].dependencies);
    
    return {
      ...state,
      memory: new Map(state.memory || new Map()).set('taskState', updatedTaskState)
    };
  }
  
  return state;
} 