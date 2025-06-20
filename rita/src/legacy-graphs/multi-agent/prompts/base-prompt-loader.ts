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

    // Method 1: Direct template property (for PromptTemplate)
    if (promptTemplate.template) {
      combinedTemplateString = promptTemplate.template;
      console.log("🔧 Found template in direct template property");
      return combinedTemplateString;
    }

    // Method 2: Access the prompt messages from the ChatPromptTemplate
    if (promptTemplate.lc_kwargs?.promptMessages) {
      const promptMessages = promptTemplate.lc_kwargs.promptMessages;

      // Extract template strings from each prompt message
      for (const promptMessage of promptMessages) {
        if (promptMessage.prompt?.template) {
          combinedTemplateString += promptMessage.prompt.template + " ";
        }
      }
      console.log("🔧 Found template in promptMessages");
    }

    // Method 3: Check messages array (for ChatPromptTemplate)
    if (promptTemplate.messages && Array.isArray(promptTemplate.messages)) {
      for (const message of promptTemplate.messages) {
        if (message.prompt?.template) {
          combinedTemplateString += message.prompt.template + " ";
        } else if (message.template) {
          combinedTemplateString += message.template + " ";
        }
      }
      console.log("🔧 Found template in messages array");
    }

    // Method 4: Check lc_kwargs.messages
    if (
      promptTemplate.lc_kwargs?.messages &&
      Array.isArray(promptTemplate.lc_kwargs.messages)
    ) {
      for (const message of promptTemplate.lc_kwargs.messages) {
        if (message.prompt?.template) {
          combinedTemplateString += message.prompt.template + " ";
        } else if (message.template) {
          combinedTemplateString += message.template + " ";
        }
      }
      console.log("🔧 Found template in lc_kwargs.messages");
    }

    console.log("🔧 Template extraction result:", {
      length: combinedTemplateString.length,
      preview:
        combinedTemplateString.substring(0, 100) +
        (combinedTemplateString.length > 100 ? "..." : ""),
    });

    return combinedTemplateString.trim();
  }

  protected async buildDynamicInvokeObject(
    combinedTemplateString: string,
    context: DynamicPromptContext,
    inputVariables: string[],
    baseInvokeObject: Record<string, any>
  ): Promise<Record<string, any>> {
    // Validate inputs
    if (!Array.isArray(inputVariables)) {
      console.warn(
        "Input variables is not an array, defaulting to empty array:",
        inputVariables
      );
      inputVariables = [];
    }

    // Create compatible context with all required properties
    const compatibleContext = {
      ...context,
      state: {
        ...context.state,
        memory: context.state.memory || new Map(),
        accessToken: context.state.accessToken || "",
        systemMessages: context.state.systemMessages || [],
        messages: context.state.messages || [],
      },
    };

    try {
      console.log(
        "🔧 About to call placeholderManager.buildInvokeObjectWithRequiredVars with:",
        {
          templateStringLength: combinedTemplateString.length,
          inputVariablesType: typeof inputVariables,
          inputVariablesLength: inputVariables?.length,
          inputVariables: inputVariables,
          baseObjectKeys: Object.keys(baseInvokeObject),
          hasCompatibleContext: !!compatibleContext,
          hasState: !!compatibleContext.state,
          hasMemory: !!compatibleContext.state?.memory,
        }
      );

      // Try the method with required vars first, fallback to regular buildInvokeObject
      if (
        typeof placeholderManager.buildInvokeObjectWithRequiredVars ===
        "function"
      ) {
        return await placeholderManager.buildInvokeObjectWithRequiredVars(
          combinedTemplateString,
          compatibleContext,
          inputVariables,
          baseInvokeObject
        );
      } else {
        console.warn(
          "🔧 buildInvokeObjectWithRequiredVars not available, falling back to buildInvokeObject"
        );
        const result = await placeholderManager.buildInvokeObject(
          combinedTemplateString,
          compatibleContext
        );

        // Merge with base object and add any missing input variables
        const mergedResult = { ...baseInvokeObject, ...result };

        // Ensure all input variables have some value
        for (const variable of inputVariables) {
          if (!(variable in mergedResult)) {
            // Try to get from state memory first
            const memoryValue = compatibleContext.state?.memory?.get(variable);
            if (memoryValue !== undefined) {
              mergedResult[variable] = memoryValue;
            } else {
              mergedResult[variable] = `{{${variable}}}`;
            }
          }
        }

        return mergedResult;
      }
    } catch (error) {
      console.error("Error in buildDynamicInvokeObject:", error);
      console.error("Error stack:", error.stack);
      console.error("Parameters:", {
        templateStringLength: combinedTemplateString.length,
        inputVariablesType: typeof inputVariables,
        inputVariablesLength: inputVariables?.length,
        baseObjectKeys: Object.keys(baseInvokeObject),
      });
      throw error;
    }
  }

  protected async extractSystemMessages(
    langSmithPrompt: Runnable,
    dynamicInvokeObject: Record<string, any>
  ): Promise<SystemMessage[]> {
    try {
      const formattedTemplate = await langSmithPrompt.invoke(
        dynamicInvokeObject
      );
      return (
        (formattedTemplate.lc_kwargs?.messages?.filter(
          (msg: any) => msg.role === "system" || msg._getType() === "system"
        ) as SystemMessage[]) || []
      );
    } catch (error) {
      console.warn("Failed to extract system messages:", error);
      return [];
    }
  }

  abstract buildBaseInvokeObject(
    context: DynamicPromptContext
  ): Record<string, any>;

  abstract loadPrompt(context: DynamicPromptContext): Promise<PromptResult>;
}
