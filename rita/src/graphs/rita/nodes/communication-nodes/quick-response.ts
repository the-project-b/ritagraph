import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";

/**
 * At the moment just a pass through node
 */
export const quickResponse: Node = async ({ messages, preferredLanguage }) => {
  console.log("💬 Direct Response");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.1 });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `You are a Payroll Specialist Assistant.
The user just said something that doesn't need a real answer or context.

Your job is to respond to the user in a way that is friendly and helpful.

Example:
I am here to help you with your payroll questions.
How can I assist you today?

Speak in {language}.
`
  ).format({ language: localeToLanguage(preferredLanguage) });

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...messages.slice(-3).filter(onBaseMessages),
  ]).invoke({});

  const response = await llm.invoke(prompt);

  return {
    messages: [...messages, new AIMessage(response.content.toString())],
  };
};
