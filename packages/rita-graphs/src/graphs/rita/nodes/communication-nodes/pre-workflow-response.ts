import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";
import { Tags } from "../../../tags.js";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";
import { promptService } from "../../../../services/prompts/prompt.service.js";
import { Result } from "@the-project-b/prompts";

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

  // Fetch prompt from LangSmith
  const rawPromptResult = await promptService.getRawPromptTemplate({
    promptName: "ritagraph-pre-workflow-response",
    source: "langsmith",
  });

  if (Result.isFailure(rawPromptResult)) {
    const error = Result.unwrapFailure(rawPromptResult);
    throw new Error(
      `Failed to fetch prompt 'ritagraph-pre-workflow-response' from LangSmith: ${error.message}`,
    );
  }

  const rawPrompt = Result.unwrap(rawPromptResult);
  const systemPrompt = await PromptTemplate.fromTemplate(
    rawPrompt.template,
  ).format({ language: localeToLanguage(preferredLanguage) });

  // const systemPrompt = await PromptTemplate.fromTemplate(
  //   `You are a Payroll Specialist Assistant.
  // Acknowledge the user's request and inform them that you are going to work on it.
  // Example:
  // Thanks, I will get to work on x, give me a moment.
  // In german use "du" and "deine" instead of "Sie" and "Ihre".
  //
  // Speak in {language}.
  // `,
  // ).format({ language: localeToLanguage(preferredLanguage) });

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
