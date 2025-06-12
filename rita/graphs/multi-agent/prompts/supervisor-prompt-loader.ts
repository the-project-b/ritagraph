import { BasePromptLoader, DynamicPromptContext, PromptResult } from './base-prompt-loader';
import { TaskState } from '../types';

export class SupervisorPromptLoader extends BasePromptLoader {
  
  buildBaseInvokeObject(context: DynamicPromptContext): Record<string, any> {
    const { state } = context;
    const lastMsg = state.messages[state.messages.length - 1];
    const taskState = state.memory?.get('taskState') as TaskState;
    
    return {
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
      timestamp: new Date().toISOString()
    };
  }

  async loadPrompt(context: DynamicPromptContext): Promise<PromptResult> {
    const { config } = context;
    
    if (!config.configurable) {
      throw new Error("Configurable is required for supervisor prompt loading");
    }

    const promptId = config.configurable.promptId;
    console.log(`🔧 SUPERVISOR PROMPT - Loading prompt: ${promptId}`);

    try {
      // Pull the prompt from LangSmith
      const langSmithPrompt = await this.pullPromptFromLangSmith(promptId);
      
      // Extract template strings
      const promptTemplate = langSmithPrompt as any;
      const combinedTemplateString = this.extractTemplateStrings(promptTemplate);
      
      // Build base invoke object with supervisor-specific variables
      const baseInvokeObject = this.buildBaseInvokeObject(context);
      
      // Build dynamic invoke object using placeholder manager
      const dynamicInvokeObject = await this.buildDynamicInvokeObject(
        combinedTemplateString,
        context,
        promptTemplate.inputVariables || [],
        baseInvokeObject
      );

      console.log("🔧 SUPERVISOR PROMPT - Dynamic invoke object keys:", Object.keys(dynamicInvokeObject));
      console.log("🔧 SUPERVISOR PROMPT - Task counts:", {
        total: dynamicInvokeObject.totalTasks,
        completed: dynamicInvokeObject.completedCount,
        pending: dynamicInvokeObject.pendingCount
      });

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
      console.error(`🔧 SUPERVISOR PROMPT - Failed to load prompt ${promptId}:`, error);
      throw error;
    }
  }
} 