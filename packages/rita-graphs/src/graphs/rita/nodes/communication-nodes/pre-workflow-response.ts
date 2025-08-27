import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";
import { Tags } from "../../../tags.js";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CommunicationNodes",
  node: "preWorkflowResponse",
});

/**
 * At the moment just a pass through node
 */
export const preWorkflowResponse: Node = async ({
  messages,
  preferredLanguage,
}) => {
  logger.info("💬 Direct Response", {
    operation: "preWorkflowResponse",
    messageCount: messages.length,
    preferredLanguage,
  });

  const llm = new ChatOpenAI({
    ...BASE_MODEL_CONFIG,
    temperature: 0.1,
    tags: [Tags.THOUGHT],
  });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `You are a Payroll Specialist Assistant.
Acknowledge the user's request and inform them that you are going to work on it.
Example:
Thanks, I will get to work on x, give me a moment.
In german use "du" and "deine" instead of "Sie" and "Ihre".

Speak in {language}.
`,
  ).format({ language: localeToLanguage(preferredLanguage) });

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...messages.slice(-3).filter(onBaseMessages),
  ]).invoke({});

  const response = await llm.invoke(prompt);

  return {
    messages: [
      ...messages,
      new AIMessage(response.content.toString(), {
        tags: ["THOUGHT"],
      }),
    ],
  };
};
