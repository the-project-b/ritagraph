import { BasePromptLoader, DynamicPromptContext, PromptResult } from './base-prompt-loader';
import { GenericPromptLoader, PromptLoaderConfig } from './generic-prompt-loader';
import { getPromptConfig, createCustomPromptConfig } from './prompt-configs';

export enum PromptLoaderType {
  SUPERVISOR = 'supervisor',
  QUERY = 'query',
  QUERY_GENERATION = 'queryGeneration',
  MUTATION = 'mutation',
  TASKS = 'tasks',
  CONTEXT_GATHERING = 'contextGathering',
  INTENT_MATCHING = 'intentMatching',
  RESULT_FORMATTING = 'resultFormatting',
  GENERIC = 'generic'
}

export class PromptFactory {
  private static loaders: Map<PromptLoaderType, BasePromptLoader> = new Map();

  static getLoader(type: PromptLoaderType): BasePromptLoader {
    if (!this.loaders.has(type)) {
      switch (type) {
        case PromptLoaderType.SUPERVISOR:
          this.loaders.set(type, new GenericPromptLoader(getPromptConfig('supervisor')));
          break;
        case PromptLoaderType.TASKS:
          this.loaders.set(type, new GenericPromptLoader(getPromptConfig('tasks')));
          break;
        case PromptLoaderType.QUERY:
          this.loaders.set(type, new GenericPromptLoader(getPromptConfig('query')));
          break;
        case PromptLoaderType.QUERY_GENERATION:
          this.loaders.set(type, new GenericPromptLoader(getPromptConfig('queryGeneration')));
          break;
        case PromptLoaderType.MUTATION:
          this.loaders.set(type, new GenericPromptLoader(getPromptConfig('mutation')));
          break;
        case PromptLoaderType.CONTEXT_GATHERING:
          this.loaders.set(type, new GenericPromptLoader(getPromptConfig('contextGathering')));
          break;
        case PromptLoaderType.INTENT_MATCHING:
          this.loaders.set(type, new GenericPromptLoader(getPromptConfig('intentMatching')));
          break;
        case PromptLoaderType.RESULT_FORMATTING:
          this.loaders.set(type, new GenericPromptLoader(getPromptConfig('resultFormatting')));
          break;
        case PromptLoaderType.GENERIC:
          // Generic loader with minimal config - can be customized at runtime
          this.loaders.set(type, new GenericPromptLoader(createCustomPromptConfig('generic', 'GENERIC PROMPT')));
          break;
        default:
          throw new Error(`Unknown prompt loader type: ${type}`);
      }
    }

    return this.loaders.get(type)!;
  }

  static async loadPrompt(
    type: PromptLoaderType,
    context: DynamicPromptContext
  ): Promise<PromptResult> {
    const loader = this.getLoader(type);
    return await loader.loadPrompt(context);
  }
}

// Convenience functions
export const loadSupervisorPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.SUPERVISOR, context);
};

export const loadQueryPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.QUERY, context);
};

export const loadQueryGenerationPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.QUERY_GENERATION, context);
};

export const loadMutationPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.MUTATION, context);
};

export const loadTasksPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.TASKS, context);
};

export const loadContextGatheringPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.CONTEXT_GATHERING, context);
};

export const loadIntentMatchingPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.INTENT_MATCHING, context);
};

export const loadResultFormattingPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.RESULT_FORMATTING, context);
};

// Generic loader with custom configuration
export const loadGenericPrompt = async (
  context: DynamicPromptContext, 
  customConfig?: Partial<PromptLoaderConfig>
): Promise<PromptResult> => {
  if (customConfig) {
    // Create a temporary loader with custom config
    const config = createCustomPromptConfig(
      customConfig.name || 'custom',
      customConfig.logPrefix || 'CUSTOM PROMPT',
      customConfig
    );
    const loader = new GenericPromptLoader(config);
    return await loader.loadPrompt(context);
  }
  
  return PromptFactory.loadPrompt(PromptLoaderType.GENERIC, context);
}; 