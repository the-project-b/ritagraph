import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";
import { Tags } from "../../../tags.js";
import { appendMessageAsThreadItem } from "../../../../utils/append-message-as-thread-item.js";
import { Result } from "../../../../utils/types/result.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CommunicationNodes",
  node: "finalMessage",
});

type AssumedConfigType = {
  thread_id: string;
};

const examples: Record<"EN" | "DE", string> = {
  EN: `
I have read your request and proposed **one data change**.
Please review them and approve or reject them.
Let me know if you need anything else.
--------
I have read your request and proposed **{{number of changes}} data changes**.
Please review them and approve or reject them.
Let me know if you need anything else.

  `,
  DE: `
Ich habe aus deiner Nachricht diesen **einen Änderungsvorschläg** ausgelesen.
Bitte überprüfe diese und nehme sie gegebenfalls an.
Lass mich wissen ob ich dir noch helfen kann.
--------
Ich habe aus deiner Nachricht diese **{{numberOfChanges}} Änderungsvorschläge** ausgelesen.
Bitte überprüfe diese und nehme sie gegebenfalls an.
Lass mich wissen ob ich dir noch helfen kann.
  `,
};

const otherExamples: Record<"EN" | "DE", string> = {
  EN: `
Okay based on your request here is the information you requested.
{{information that is not a change but just a list of information}}
  `,
  DE: `
Okay basierend auf deiner Anfrage hier ist die Information die du gefragt hast.
{{Information that is not a change but just a list of information}}
  `,
};

/**
 * At the moment just a pass through node
 */
export const finalMessage: Node = async (
  {
    workflowEngineResponseDraft,
    preferredLanguage,
    messages,
    selectedCompanyId,
  },
  config,
  getAuthUser,
) => {
  logger.info("💬 Final Response", {
    operation: "finalMessage",
    messageCount: messages.length,
    preferredLanguage,
    hasDraftResponse: !!workflowEngineResponseDraft,
  });
  const { token: accessToken, appdataHeader } = getAuthUser(config);

  const { thread_id: langgraphThreadId } =
    config.configurable as unknown as AssumedConfigType;

  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    tags: [Tags.COMMUNICATION],
  });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `Respond to the users request.

Guidelines:
 - Be concise but friendly.
 - Do not say "I will get back to you" or "I will send you an email" or anything like that.
 - If you could not find information say so
 - There will never be "pending" operations only thigns to be approved or rejected by the user.
 - Do not claim or say that there is an operation pending.
 - NEVER include ids like UUIDs in the response.
 - In german: NEVER use the formal "Sie" or "Ihre" always use casual "du" or "deine".
 - For data changes: Always prefer to answer in brief sentence. DO NOT enumerate the changes, that will be done by something else.
 - FOR DATA CHANGES FOLLOW THE EXAMPLE BELOW.

#examples - For data changes
{examples}
#/examples

#examples - For other cases like listing information
{otherExamples}
#/examples


{dataRepresentationLayerPrompt}

Speak in {language}.

Drafted Response: {draftedResponse}
  `,
  ).format({
    examples: examples[preferredLanguage],
    otherExamples: otherExamples[preferredLanguage],
    dataRepresentationLayerPrompt,
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
    context: {
      accessToken,
      selectedCompanyId,
      appdataHeader,
    },
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
