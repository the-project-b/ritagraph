import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MergedAnnotation } from "../states/states";
import { Runnable } from "@langchain/core/runnables";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import * as hub from "langchain/hub/node";
import { SystemMessage } from "@langchain/core/messages";
import { placeholderManager } from "../placeholders";

interface QuestionPromptNodeConfig {
  promptId: string;
  model: BaseChatModel; // Optional when extracting system prompts
  extractSystemPrompts?: boolean;
}

const createQuestionPromptNode = () => {
  return async function questionPromptNode(
    state: typeof MergedAnnotation.State,
    config: LangGraphRunnableConfig<QuestionPromptNodeConfig>
  ) {
    // console.log("Question Prompt Node - Configurable:", config.configurable);

    if (!config.configurable) {
      throw new Error("Configurable is required");
    }

    // Priority: 1. State accessToken, 2. Auth token from config
    const authUser =
      (config as any)?.user ||
      (config as any)?.langgraph_auth_user ||
      ((config as any)?.configurable &&
        (config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;

    // Use state accessToken if available, otherwise fall back to auth token
    const accessToken = state.accessToken || authAccessToken;

    console.log("Question Prompt Node - Access token:", accessToken);

    const langSmithPrompt = await hub.pull<Runnable>(
      config.configurable.promptId.replace("-/", "")
    );

    const lastMsg = state.messages[state.messages.length - 1];

    // Extract template strings from the ChatPromptTemplate object
    let combinedTemplateString = "";

    // Type assertion to access ChatPromptTemplate properties
    const promptTemplate = langSmithPrompt as any;

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

    // Build the dynamic invoke object using the placeholder manager
    const baseInvokeObject = { question: lastMsg.content };
    const dynamicInvokeObject =
      await placeholderManager.buildInvokeObjectWithRequiredVars(
        combinedTemplateString,
        { state, config },
        promptTemplate.inputVariables || [],
        baseInvokeObject
      );

    console.log("Dynamic invoke object:", dynamicInvokeObject);

    // Now invoke the prompt with the complete dynamic object
    const chain = langSmithPrompt.pipe(config.configurable.model);
    const promptResult = await chain.invoke(dynamicInvokeObject);

    // For system message extraction, we need to invoke the template first to get the formatted messages
    const formattedTemplate = await langSmithPrompt.invoke(dynamicInvokeObject);
    const systemMessages =
      (formattedTemplate.lc_kwargs?.messages?.filter(
        (msg: any) => msg.role === "system" || msg._getType() === "system"
      ) as SystemMessage[]) || [];

    return {
      messages: [promptResult],
      systemMessages: systemMessages,
    };
  };
};

export { createQuestionPromptNode, type QuestionPromptNodeConfig };
