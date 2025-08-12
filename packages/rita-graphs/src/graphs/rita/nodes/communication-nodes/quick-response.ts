import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";
import { Tags } from "../../../tags.js";
import { appendMessageAsThreadItem } from "../../../../utils/append-message-as-thread-item.js";
import { Result } from "../../../../utils/types/result.js";
import { getAuthUser } from "../../../../security/auth.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CommunicationNodes",
  node: "quickResponse",
});

type AssumedConfigType = {
  thread_id: string;
};

/**
 * At the moment just a pass through node
 */
export const quickResponse: Node = async (
  { messages, preferredLanguage },
  config,
) => {
  logger.info("💬 Direct Response", {
    operation: "quickResponse",
    messageCount: messages.length,
    preferredLanguage,
  });

  const { token, appdataHeader } = getAuthUser(config);
  const { thread_id: langgraphThreadId } =
    config.configurable as unknown as AssumedConfigType;

  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.1,
    tags: [Tags.COMMUNICATION],
  });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `You are a Payroll Specialist Assistant.
The user just said something that doesn't need a real answer or context.

Your job is to respond to the user in a way that is friendly and helpful.

Example:
I am here to help you with your payroll questions.
How can I assist you today?

Speak in {language}.
`,
  ).format({ language: localeToLanguage(preferredLanguage) });

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...messages.slice(-3).filter(onBaseMessages),
  ]).invoke({});

  const response = await llm.invoke(prompt);
  const responseMessage = new AIMessage(response.content.toString());

  const appendMessageResult = await appendMessageAsThreadItem({
    message: responseMessage,
    langgraphThreadId,
    ctx: { accessToken: token, appdataHeader },
  });

  if (Result.isFailure(appendMessageResult)) {
    logger.error("Failed to append message as thread item", {
      error: Result.unwrapFailure(appendMessageResult),
    });
  }

  return {
    messages: [...messages, responseMessage],
  };
};
