import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Runnable } from "@langchain/core/runnables";
import { SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import * as hub from "langchain/hub/node";
import { placeholderManager } from "../../../placeholders";
import { ExtendedState } from "../../../states/states";

export interface BasePromptConfig {
  promptId: string;
  model: BaseChatModel;
  extractSystemPrompts?: boolean;
}

export interface PromptResult {
  messages: any[];
  systemMessages?: SystemMessage[];
  populatedPrompt?: any;
}

export interface DynamicPromptContext {
  state: ExtendedState;
  config: LangGraphRunnableConfig<BasePromptConfig>;
}

export abstract class BasePromptLoader {
  protected async pullPromptFromLangSmith(promptId: string): Promise<Runnable> {
    try {
      return await hub.pull<Runnable>(promptId.replace("-/", ""));
    } catch (error) {
      console.error(`Failed to pull prompt ${promptId} from LangSmith:`, error);
      throw error;
    }
  }

  protected extractTemplateStrings(promptTemplate: any): string {
    let combinedTemplateString = "";
    
    // Access the prompt messages from the ChatPromptTemplate
    if (promptTemplate.lc_kwargs?.promptMessages) {
      const promptMessages = promptTemplate.lc_kwargs.promptMessages;
      
      // Extract template strings from each prompt message
      for (const promptMessage of promptMessages) {
        if (promptMessage.prompt?.template) {
          combinedTemplateString += promptMessage.prompt.template + " ";
        }
      }
    }
    
    return combinedTemplateString;
  }

  protected async buildDynamicInvokeObject(
    combinedTemplateString: string,
    context: DynamicPromptContext,
    inputVariables: string[],
    baseInvokeObject: Record<string, any>
  ): Promise<Record<string, any>> {
    // Create compatible context with all required properties
    const compatibleContext = {
      ...context,
      state: {
        ...context.state,
        memory: context.state.memory || new Map(),
        accessToken: context.state.accessToken || '',
        systemMessages: context.state.systemMessages || [],
        messages: context.state.messages || []
      }
    };
    
    return await placeholderManager.buildInvokeObjectWithRequiredVars(
      combinedTemplateString,
      compatibleContext,
      inputVariables,
      baseInvokeObject
    );
  }

  protected async extractSystemMessages(
    langSmithPrompt: Runnable,
    dynamicInvokeObject: Record<string, any>
  ): Promise<SystemMessage[]> {
    try {
      const formattedTemplate = await langSmithPrompt.invoke(dynamicInvokeObject);
      return formattedTemplate.lc_kwargs?.messages?.filter(
        (msg: any) => msg.role === "system" || msg._getType() === "system"
      ) as SystemMessage[] || [];
    } catch (error) {
      console.warn("Failed to extract system messages:", error);
      return [];
    }
  }

  abstract buildBaseInvokeObject(context: DynamicPromptContext): Record<string, any>;
  
  abstract loadPrompt(context: DynamicPromptContext): Promise<PromptResult>;
} 