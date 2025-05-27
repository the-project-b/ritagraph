import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MergedAnnotation } from "../states/states";
import { Runnable } from "@langchain/core/runnables";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import * as hub from "langchain/hub/node";
import { SystemMessage } from "@langchain/core/messages";

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
    console.log("Question Prompt Node - Configurable:", config.configurable);

    if (!config.configurable) {
      throw new Error("Configurable is required");
    }

    const langSmithPrompt = await hub.pull<Runnable>(
      config.configurable.promptId.replace("-/", "")
    );

    const lastMsg = state.messages[state.messages.length - 1];
    const promptTemplate = await langSmithPrompt.invoke({ question: lastMsg.content });

    const chain = langSmithPrompt.pipe(config.configurable.model);
    const promptResult = await chain.invoke({ question: lastMsg.content })

    const systemMessages = promptTemplate.lc_kwargs.messages.filter(
      (msg) => msg.role === "system" || msg._getType() === "system"
    ) as SystemMessage[];

    return {
      messages: [promptResult],
      systemMessages: systemMessages,
    };
  };
};

export { createQuestionPromptNode, type QuestionPromptNodeConfig };
