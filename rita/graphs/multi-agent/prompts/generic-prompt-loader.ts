import { BasePromptLoader, DynamicPromptContext, PromptResult } from './base-prompt-loader';
import { TaskState } from '../types';

export interface PromptLoaderConfig {
  name: string;
  logPrefix: string;
  buildInvokeObject?: (context: DynamicPromptContext, baseObject: Record<string, any>) => Record<string, any>;
  customVariables?: Record<string, any>;
}

export class GenericPromptLoader extends BasePromptLoader {
  private config: PromptLoaderConfig;

  constructor(config: PromptLoaderConfig) {
    super();
    this.config = config;
  }

  buildBaseInvokeObject(context: DynamicPromptContext): Record<string, any> {
    const { state } = context;
    const lastMsg = state.messages && state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;
    const taskState = state.memory?.get('taskState') as TaskState;
    
    // Build standard base object
    const baseObject = {
      question: lastMsg?.content || '',
      // Task-related variables
      currentTasks: taskState?.tasks || [],
      completedTasks: taskState?.tasks?.filter(t => t.status === 'completed') || [],
      pendingTasks: taskState?.tasks?.filter(t => t.status === 'pending') || [],
      inProgressTasks: taskState?.tasks?.filter(t => t.status === 'in_progress') || [],
      failedTasks: taskState?.tasks?.filter(t => t.status === 'failed') || [],
      // Task statistics
      totalTasks: taskState?.tasks?.length || 0,
      completedCount: taskState?.tasks?.filter(t => t.status === 'completed').length || 0,
      pendingCount: taskState?.tasks?.filter(t => t.status === 'pending').length || 0,
      // Agent decision history
      agentDecisions: state.memory?.get("agentDecisions") || [],
      // Message context (last few messages for context)
      messageHistory: state.messages?.slice(-5) || [],
      // Current execution context
      recursionCount: state.memory?.get('recursionCount') || 0,
      lastProcessedMessage: state.memory?.get('lastProcessedMessage') || '',
      // Available tools context
      availableTools: ['transfer_to_query_agent', 'transfer_to_mutation_agent', 'get_next_task'],
      // Current timestamp
      timestamp: new Date().toISOString(),
      // Common variables that might be needed
      request: state.memory?.get('request') || state.memory?.get('userRequest') || '',
      userRequest: state.memory?.get('userRequest') || state.memory?.get('request') || '',
      // Add any custom variables from config
      ...this.config.customVariables
    };

    // Apply custom invoke object builder if provided
    if (this.config.buildInvokeObject) {
      return this.config.buildInvokeObject(context, baseObject);
    }

    return baseObject;
  }

  async loadPrompt(context: DynamicPromptContext): Promise<PromptResult> {
    const { config } = context;
    
    if (!config.configurable) {
      throw new Error(`Configurable is required for ${this.config.name} prompt loading`);
    }

    const promptId = config.configurable.promptId;
    console.log(`🔧 ${this.config.logPrefix} - Loading prompt: ${promptId}`);

    try {
      // Pull the prompt from LangSmith
      const langSmithPrompt = await this.pullPromptFromLangSmith(promptId);
      
      // Extract template strings
      const promptTemplate = langSmithPrompt as any;
      console.log(`🔧 ${this.config.logPrefix} - Prompt template structure:`, {
        hasLcKwargs: !!promptTemplate.lc_kwargs,
        hasInputVariables: !!promptTemplate.inputVariables,
        hasLcKwargsInputVariables: !!promptTemplate.lc_kwargs?.inputVariables,
        hasTemplate: !!promptTemplate.template,
        hasMessages: !!promptTemplate.messages,
        hasLcKwargsMessages: !!promptTemplate.lc_kwargs?.messages,
        promptKeys: Object.keys(promptTemplate)
      });
      
      // Debug: Log the actual template content if it exists
      if (promptTemplate.template) {
        console.log(`🔧 ${this.config.logPrefix} - Direct template preview (substring):`, promptTemplate.template.substring(0, 200));
      }
      if (promptTemplate.messages) {
        console.log(`🔧 ${this.config.logPrefix} - Messages count:`, promptTemplate.messages.length);
      }
      if (promptTemplate.lc_kwargs?.messages) {
        console.log(`🔧 ${this.config.logPrefix} - LcKwargs messages count:`, promptTemplate.lc_kwargs.messages.length);
      }
      
      const combinedTemplateString = this.extractTemplateStrings(promptTemplate);
      console.log(`🔧 ${this.config.logPrefix} - Combined template string length:`, combinedTemplateString.length);
      
      // Build base invoke object
      const baseInvokeObject = this.buildBaseInvokeObject(context);
      
      // Build dynamic invoke object using placeholder manager
      const inputVariables = promptTemplate.inputVariables || promptTemplate.lc_kwargs?.inputVariables || [];
      console.log(`🔧 ${this.config.logPrefix} - Input variables:`, inputVariables);
      
      const dynamicInvokeObject = await this.buildDynamicInvokeObject(
        combinedTemplateString,
        context,
        inputVariables,
        baseInvokeObject
      );

      // Log specific variables based on prompt type
      if (this.config.name === 'tasks') {
        console.log(`🔧 ${this.config.logPrefix} - Request variable:`, dynamicInvokeObject.request ? 'populated' : 'empty');
      } else if (this.config.name === 'supervisor') {
        console.log(`🔧 ${this.config.logPrefix} - Task counts:`, {
          total: dynamicInvokeObject.totalTasks,
          completed: dynamicInvokeObject.completedCount,
          pending: dynamicInvokeObject.pendingCount
        });
      }

      // Create the chain and invoke
      const chain = langSmithPrompt.pipe(config.configurable.model);
      const promptResult = await chain.invoke(dynamicInvokeObject);

      // Extract system messages if requested
      let systemMessages = [];
      if (config.configurable.extractSystemPrompts) {
        systemMessages = await this.extractSystemMessages(langSmithPrompt, dynamicInvokeObject);
      }

      return {
        messages: [promptResult],
        systemMessages,
        populatedPrompt: await langSmithPrompt.invoke(dynamicInvokeObject)
      };

    } catch (error) {
      console.error(`🔧 ${this.config.logPrefix} - Failed to load prompt ${promptId}:`, error);
      throw error;
    }
  }
} 