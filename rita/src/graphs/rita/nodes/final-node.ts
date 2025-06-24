import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../graph-state";
import { PromptTemplate } from "@langchain/core/prompts";
import { AIMessage } from "@langchain/core/messages";
import { getConversationMessages } from "../../../utils/format-helpers/message-filters";

/**
 * At the moment just a pass through node
 */
export const finalNode: Node = async (state) => {
  console.log("🔄 Router - state:", state);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const finalPrompt =
    PromptTemplate.fromTemplate(`Respond to the user briefly and well structured using tables or lists.
Use emojis only for structuring the response. Be concise but friendly.

Drafted Response: {draftedResponse}
-------
previousMessages: {previousMessages}
  `);

  const formattedPrompt = await finalPrompt.format({
    draftedResponse: state.draftedResponse,
    previousMessages: getConversationMessages(state.messages, 3),
  });

  const response = await llm.invoke(formattedPrompt);

  return {
    messages: [...state.messages, new AIMessage(response.content.toString())],
  };
};
