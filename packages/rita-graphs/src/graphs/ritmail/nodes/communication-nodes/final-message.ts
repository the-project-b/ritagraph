import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { Node } from "../../graph-state.js";
import { PromptTemplate } from "@langchain/core/prompts";
import { AIMessage } from "@langchain/core/messages";
import { getConversationMessages } from "../../../../utils/format-helpers/message-filters.js";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "RitmailCommunicationNodes",
  node: "finalNode",
});

/**
 * This node communicates the results with the user.
 */
export const finalNode: Node = async ({
  workflowEngineResponseDraft,
  preferredLanguage,
  messages,
}) => {
  logger.info("💬 Final Response - state:", {
    operation: "finalNode",
    messageCount: messages.length,
    preferredLanguage,
    hasDraftResponse: !!workflowEngineResponseDraft,
  });
  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 });

  const finalPrompt = await PromptTemplate.fromTemplate(
    `
Respond to the user briefly and well structured using tables or lists.
- Be concise but friendly
- Use emojis ONLY for structuring the response
- Depending on the context, begin your message with something like "Found it..."
- If data is provided informally (no tables or lists), use block quotes to highlight the key information

Speak in {language}.

Drafted Response: {draftedResponse}
-------
PreviousMessages: {previousMessages}
  `
  ).format({
    language: localeToLanguage(preferredLanguage),
    draftedResponse: workflowEngineResponseDraft,
    previousMessages: getConversationMessages(messages, 3),
  });

  const response = await llm.invoke(finalPrompt);

  return {
    messages: [...messages, new AIMessage(response.content.toString())],
  };
};
