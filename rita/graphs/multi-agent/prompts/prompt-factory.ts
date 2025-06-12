import { BasePromptLoader, DynamicPromptContext, PromptResult } from './base-prompt-loader';
import { SupervisorPromptLoader } from './supervisor-prompt-loader';

export enum PromptLoaderType {
  SUPERVISOR = 'supervisor',
  QUERY = 'query',
  MUTATION = 'mutation'
}

export class PromptFactory {
  private static loaders: Map<PromptLoaderType, BasePromptLoader> = new Map();

  static getLoader(type: PromptLoaderType): BasePromptLoader {
    if (!this.loaders.has(type)) {
      switch (type) {
        case PromptLoaderType.SUPERVISOR:
          this.loaders.set(type, new SupervisorPromptLoader());
          break;
        case PromptLoaderType.QUERY:
        case PromptLoaderType.MUTATION:
          // For now, use supervisor loader as base - can be extended later
          this.loaders.set(type, new SupervisorPromptLoader());
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

export const loadMutationPrompt = async (context: DynamicPromptContext): Promise<PromptResult> => {
  return PromptFactory.loadPrompt(PromptLoaderType.MUTATION, context);
}; 