import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";

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

  const systemPrompt = await PromptTemplate.fromTemplate(
    `Respond to the user briefly and well structured using tables or lists.
Use emojis only for structuring the response. Be concise but friendly.

Speak in {language}.

Drafted Response: {draftedResponse}
  `
  ).format({
    language: localeToLanguage(preferredLanguage),
    draftedResponse: workflowEngineResponseDraft,
  });

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...messages.slice(-3).filter(onBaseMessages),
  ]).invoke({});

  const response = await llm.invoke(prompt);

  return {
    messages: [...messages, new AIMessage(response.content.toString())],
  };
};
