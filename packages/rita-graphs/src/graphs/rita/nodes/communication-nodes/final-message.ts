import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";
import { Tags } from "../../../tags.js";
import { getAuthUser } from "../../../../security/auth.js";
import { appendMessageAsThreadItem } from "../../../../utils/append-message-as-thread-item.js";
import { Result } from "../../../../utils/types/result.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CommunicationNodes",
  node: "finalMessage",
});

type AssumedConfigType = {
  thread_id: string;
};

/**
 * At the moment just a pass through node
 */
export const finalMessage: Node = async (
  { workflowEngineResponseDraft, preferredLanguage, messages },
  config,
) => {
  logger.info("💬 Final Response", {
    operation: "finalMessage",
    messageCount: messages.length,
    preferredLanguage,
    hasDraftResponse: !!workflowEngineResponseDraft,
  });
  const { token, appdataHeader } = getAuthUser(config);

  const { thread_id: langgraphThreadId } =
    config.configurable as unknown as AssumedConfigType;

  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    tags: [Tags.COMMUNICATION],
  });

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

${dataRepresentationLayerPrompt}

Speak in {language}.

Drafted Response: {draftedResponse}
  `,
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
          : true,
      )
      .slice(-3)
      .filter(onBaseMessages),
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
