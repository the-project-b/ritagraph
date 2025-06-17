import { PromptLoaderConfig } from './generic-prompt-loader';
import { DynamicPromptContext } from './base-prompt-loader';

// Configuration for different prompt types
export const PROMPT_CONFIGS: Record<string, PromptLoaderConfig> = {
  supervisor: {
    name: 'supervisor',
    logPrefix: 'SUPERVISOR PROMPT',
    customVariables: {
      availableTools: ['transfer_to_query_agent', 'transfer_to_mutation_agent', 'get_next_task']
    }
  },

  tasks: {
    name: 'tasks',
    logPrefix: 'TASKS PROMPT',
    buildInvokeObject: (context: DynamicPromptContext, baseObject: Record<string, any>) => {
      // Tasks-specific enhancements
      return {
        ...baseObject,
        // Ensure request is properly populated for tasks
        request: context.state.memory?.get('request') || 
                context.state.memory?.get('userRequest') || 
                context.state.messages[context.state.messages.length - 1]?.content || '',
        // Add task extraction specific variables
        extractionMode: 'llm',
        taskTypes: ['query', 'mutation'],
        targetAgents: ['query_agent', 'mutation_agent']
      };
    }
  },

  query: {
    name: 'query',
    logPrefix: 'QUERY PROMPT',
    buildInvokeObject: (context: DynamicPromptContext, baseObject: Record<string, any>) => {
      return {
        ...baseObject,
        // Query-specific variables
        queryType: 'data_retrieval',
        availableQueries: context.state.memory?.get('discoveredQueries') || [],
        selectedQuery: context.state.memory?.get('selectedQuery') || null,
        typeDetails: context.state.memory?.get('typeDetails') || null
      };
    }
  },

  queryGeneration: {
    name: 'queryGeneration',
    logPrefix: 'QUERY GENERATION PROMPT',
    buildInvokeObject: (context: DynamicPromptContext, baseObject: Record<string, any>) => {
      return {
        ...baseObject,
        // Query generation specific variables
        userRequest: context.state.memory?.get('userRequest') || 
                    context.state.memory?.get('request') || 
                    baseObject.request || '',
        selectedQueryName: context.state.memory?.get('selectedQueryName') || '',
        rawQueryDetails: context.state.memory?.get('rawQueryDetails') || '',
        rawTypeDetails: context.state.memory?.get('rawTypeDetails') || '',
        originalInputType: context.state.memory?.get('originalInputType') || '',
        signatureInputType: context.state.memory?.get('signatureInputType') || '',
        originalOutputType: context.state.memory?.get('originalOutputType') || '',
        signatureOutputType: context.state.memory?.get('signatureOutputType') || '',
        parameterStrategies: context.state.memory?.get('parameterStrategies') || '',
        // Additional context for query generation
        gatheredContext: context.state.memory?.get('gatheredContext') || {},
        generationMode: 'graphql_with_placeholders',
        placeholderStrategy: 'mustache_format'
      };
    }
  },

  mutation: {
    name: 'mutation',
    logPrefix: 'MUTATION PROMPT',
    buildInvokeObject: (context: DynamicPromptContext, baseObject: Record<string, any>) => {
      return {
        ...baseObject,
        // Mutation-specific variables
        mutationType: 'data_modification',
        availableMutations: context.state.memory?.get('discoveredMutations') || [],
        selectedMutation: context.state.memory?.get('selectedMutation') || null,
        validationRules: context.state.memory?.get('validationRules') || []
      };
    }
  },

  contextGathering: {
    name: 'contextGathering',
    logPrefix: 'CONTEXT GATHERING PROMPT',
    buildInvokeObject: (context: DynamicPromptContext, baseObject: Record<string, any>) => {
      return {
        ...baseObject,
        // Context gathering specific variables
        gatheringPhase: 'parameter_resolution',
        availableContext: context.state.memory?.get('gatheredContext') || {},
        userContext: context.state.memory?.get('userContext') || {},
        staticContext: context.state.memory?.get('staticContext') || {}
      };
    }
  },

  intentMatching: {
    name: 'intentMatching',
    logPrefix: 'INTENT MATCHING PROMPT',
    buildInvokeObject: (context: DynamicPromptContext, baseObject: Record<string, any>) => {
      return {
        ...baseObject,
        // Intent matching specific variables
        queries: context.state.memory?.get('queries') || 
                context.state.memory?.get('discoveredQueries') || 
                'No queries available',
        userRequest: context.state.memory?.get('userRequest') || 
                    context.state.memory?.get('request') || 
                    baseObject.request || 
                    baseObject.question || '',
        // Additional context for better intent matching
        availableQueryNames: context.state.memory?.get('discoveredQueries')?.split('\n')
          .filter((line: string) => line.trim() && !line.startsWith('#'))
          .map((line: string) => line.split(':')[0]?.trim())
          .filter(Boolean) || [],
        matchingMode: 'semantic_analysis',
        fallbackStrategy: 'keyword_matching'
      };
    }
  },

  resultFormatting: {
    name: 'resultFormatting',
    logPrefix: 'RESULT FORMATTING PROMPT',
    buildInvokeObject: (context: DynamicPromptContext, baseObject: Record<string, any>) => {
      // Use templateTaskState if available (for template rendering), otherwise use real taskState
      const taskState = context.state.memory?.get('templateTaskState') || context.state.memory?.get('taskState');
      const currentTask = baseObject.currentTasks?.find((t: any) => t.status === 'in_progress') || 
                         baseObject.currentTasks?.[0];
      const currentTaskIndex = taskState?.tasks?.findIndex((t: any) => t.status === 'in_progress') ?? -1;
      
      // Determine scenario based on task type and status
      let scenario = 'task_completion';
      if (currentTask?.status === 'failed') {
        scenario = 'task_failure';
      } else if (currentTask?.type === 'query') {
        scenario = 'query_result';
      } else if (currentTask?.type === 'mutation') {
        scenario = 'mutation_result';
      }
      
      // Get result data
      const resultData = currentTask?.result || currentTask?.queryDetails?.queryResult || null;
      const hasError = currentTask?.status === 'failed' || currentTask?.error;
      
      // Build comprehensive task info
      const allTasksInfo = baseObject.currentTasks?.map((task: any, index: number) => ({
        number: index + 1,
        description: task.description,
        status: task.status,
        type: task.type,
        hasResult: !!(task.result || task.queryDetails?.queryResult)
      })) || [];
      
      // Get context info from gathered context
      const gatheredContext = context.state.memory?.get('gatheredContext');
      const contextInfo = gatheredContext ? {
        hasUserContext: Object.keys(gatheredContext.userContext || {}).length > 0,
        hasStaticContext: Object.keys(gatheredContext.staticContext || {}).length > 0,
        hasDynamicContext: Object.keys(gatheredContext.dynamicContext || {}).length > 0,
        resolutionStrategies: gatheredContext.resolutionStrategies?.length || 0
      } : null;
      
      return {
        ...baseObject,
        // Result formatting specific variables that match the prompt template exactly
        scenario,
        taskDescription: currentTask?.description || 'Unknown task',
        taskStatus: currentTask?.status || 'unknown',
        currentTaskNumber: currentTaskIndex >= 0 ? currentTaskIndex + 1 : 1,
        totalTasks: baseObject.totalTasks || 0,
        resultData: resultData ? JSON.stringify(resultData, null, 2) : 'No result data',
        errorInfo: hasError ? `ERROR: ${currentTask?.error || 'Task failed'}` : '',
        // Format allTasksInfo as readable text for the prompt
        allTasksInfo: allTasksInfo.length > 0 ? 
          `ALL TASKS:\n${allTasksInfo.map(task => `- ${task.description} (${task.status})`).join('\n')}` : 
          '',
        // Format contextInfo as readable text for the prompt  
        contextInfo: contextInfo ? 
          `CONTEXT: User context available: ${contextInfo.hasUserContext}, Static context: ${contextInfo.hasStaticContext}, Dynamic context: ${contextInfo.hasDynamicContext}, Resolution strategies: ${contextInfo.resolutionStrategies}` : 
          'CONTEXT: No context available',
        // Format executionTime as readable text
        executionTime: currentTask?.executionTime ? 
          `EXECUTION TIME: ${currentTask.executionTime}` : 
          'EXECUTION TIME: Unknown',
        // Legacy variables for backward compatibility
        formattingMode: 'user_friendly',
        taskResult: currentTask?.result || null,
        queryResult: currentTask?.queryDetails?.queryResult || null,
        confidence: currentTask?.confidence || 0.5
      };
    }
  }
};

// Helper function to get a specific config
export function getPromptConfig(type: string): PromptLoaderConfig {
  const config = PROMPT_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown prompt config type: ${type}`);
  }
  return config;
}

// Helper function to create a custom config
export function createCustomPromptConfig(
  name: string,
  logPrefix: string,
  customOptions?: Partial<PromptLoaderConfig>
): PromptLoaderConfig {
  return {
    name,
    logPrefix,
    ...customOptions
  };
} 