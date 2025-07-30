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
  console.log("💬 Final Response");
  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `Respond to the users request.

Try to use tables to make the response more compact and readable.

Guidelines:
 - Brief and well structured response.
 - Use tables or lists to make the response more compact and readable.
 - Use emojis only for structuring the response.
 - Be concise but friendly.
 - Do not say "I will get back to you" or "I will send you an email" or anything like that.
 - If you could not find information say so
 - There will never be "pending" operations only thigns to be approved or rejected by the user.
 - Do not claim or say that there is an operation pending.

Speak in {language}.

Drafted Response: {draftedResponse}
  `
  ).format({
    language: localeToLanguage(preferredLanguage),
    draftedResponse: workflowEngineResponseDraft,
  });

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...messages
      .filter((i) =>
        Array.isArray(i.additional_kwargs?.tags)
          ? !i.additional_kwargs?.tags.includes("THOUGHT")
          : true
      )
      .slice(-3)
      .filter(onBaseMessages),
  ]).invoke({});

  const response = await llm.invoke(prompt);

  return {
    messages: [...messages, new AIMessage(response.content.toString())],
  };
};
