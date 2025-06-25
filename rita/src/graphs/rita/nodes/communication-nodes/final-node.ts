import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../../graph-state";
import { PromptTemplate } from "@langchain/core/prompts";
import { AIMessage } from "@langchain/core/messages";
import { getConversationMessages } from "../../../../utils/format-helpers/message-filters";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language";

/**
 * At the moment just a pass through node
 */
export const finalNode: Node = async (state, { userLocale }) => {
  console.log("🔄 Router - state:", state);

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
    language: localeToLanguage(userLocale),
    draftedResponse: state.workflowEngineResponseDraft,
    previousMessages: getConversationMessages(state.messages, 3),
  });

  const response = await llm.invoke(finalPrompt);

  return {
    messages: [...state.messages, new AIMessage(response.content.toString())],
  };
};
