import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";

/**
 * At the moment just a pass through node
 */
export const preWorkflowResponse: Node = async ({
  messages,
  preferredLanguage,
}) => {
  console.log("💬 Direct Response - state:");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `You are a Payroll Specialist Assistant.
Acknowledge the user's request and inform them that you are going to work on it.
Example:
Thanks, I will get to work on x, give me a moment.

Speak in {language}.
`
  ).format({ language: localeToLanguage(preferredLanguage) });

  const prompt = await ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ...messages.slice(-3),
  ]).invoke({});

  const response = await llm.invoke(prompt);

  return {
    messages: [...messages, new AIMessage(response.content.toString())],
  };
};
