import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../../graph-state.js";
import { PromptTemplate } from "@langchain/core/prompts";
import { AIMessage } from "@langchain/core/messages";
import { getConversationMessages } from "../../../../utils/format-helpers/message-filters.js";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";

/**
 * At the moment just a pass through node
 */
export const finalMessage: Node = async ({
  workflowEngineResponseDraft,
  preferredLanguage,
  messages,
}) => {
  console.log("💬 Final Response - state:");
  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const finalPrompt = await PromptTemplate.fromTemplate(
    `Respond to the user briefly and well structured using tables or lists.
Use emojis only for structuring the response. Be concise but friendly.

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
