import { Task, TaskState, DataRequirement, Source, Citation } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { ExtendedState } from '../../../states/states';
import { createQueryAgent } from '../agents/query-agent';

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
  return updateTaskState(state, taskId, {
    status: 'completed',
    result
  });
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
    "type": "query" or "mutation",
    "targetAgent": "query_agent" or "mutation_agent",
    "dependencies": ["task_id of dependency"]
  }
]

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
      if (!['query', 'mutation'].includes(task.type)) {
        throw new Error(`Task ${index} has invalid type: ${task.type}`);
      }

      // Validate target agent
      if (!['query_agent', 'mutation_agent'].includes(task.targetAgent)) {
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
export function updateMemoryWithTaskState(state: ExtendedState, { tasks }: { tasks: Task[] }): ExtendedState {
  return {
    ...state,
    memory: new Map(state.memory || new Map()).set("taskState", {
      tasks,
      currentTaskIndex: 0,
      completedTasks: new Set<string>(),
      failedTasks: new Set<string>()
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

  const updatedTasks = taskState.tasks.map(task =>
    task.id === taskId
      ? { ...task, status: error ? "failed" : "completed", result, error }
      : task
  );

  const updatedTaskState = {
    ...taskState,
    tasks: updatedTasks,
    completedTasks: error ? taskState.completedTasks : new Set([...taskState.completedTasks, taskId]),
    failedTasks: error ? new Set([...taskState.failedTasks, taskId]) : taskState.failedTasks
  };

  return {
    ...state,
    memory: new Map(state.memory || new Map()).set("taskState", updatedTaskState)
  };
}

/**
 * Updates the current task index in the state
 */
export function updateCurrentTask(state: ExtendedState, { taskIndex }: { taskIndex: number }): ExtendedState {
  const taskState = state.memory?.get('taskState') as TaskState;
  if (!taskState) return state;

  return {
    ...state,
    memory: new Map(state.memory || new Map()).set("taskState", {
      ...taskState,
      currentTaskIndex: taskIndex
    })
  };
}

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