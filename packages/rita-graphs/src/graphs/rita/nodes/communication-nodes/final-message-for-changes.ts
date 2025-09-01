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
import { BASE_MODEL_CONFIG } from "../../../model-config.js";
import { createGraphQLClient } from "../../../../utils/graphql/client.js";
import { DataChangeProposal } from "../../../shared-types/base-annotation.js";
import { getProposalsOfThatRun } from "./final-message-edge-decision.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CommunicationNodes",
  node: "finalMessage",
});

type AssumedConfigType = {
  thread_id: string;
  run_id: string;
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

const examplesForMissingInformation: Record<"EN" | "DE", string> = {
  EN: `
I have read your request and proposed **{{numberOfChanges}} data changes**.
However I had problem with [change description], can you try that again?
Please review the rest of the changes and approve or reject them.
Let me know if you need anything else.
  `,
  DE: `
Ich habe deine Anfrage gelesen und habe **{{numberOfChanges}} Änderungsvorschläge** vorgeschlagen.
Allerdings hatte ich Probleme mit [change description], kannst du das nochmal versuchen, anders formulieren?
Bitte überprüfe die restlichen Änderungen und nehme sie gegebenfalls an.
Lass mich wissen, ob ich dir noch weiterhelfen kann.
  `,
};

/**
 * At the moment just a pass through node
 */
export const finalMessageForChanges: Node = async (
  {
    workflowEngineResponseDraft,
    preferredLanguage,
    messages,
    selectedCompanyId,
  },
  config,
  getAuthUser,
) => {
  logger.info("💬 Final Response for changes", {
    operation: "finalMessage for changes",
    messageCount: messages.length,
    preferredLanguage,
    hasDraftResponse: !!workflowEngineResponseDraft,
  });
  const { token: accessToken, appdataHeader } = getAuthUser(config);

  const graphqlClient = createGraphQLClient({
    accessToken,
    appdataHeader,
  });

  const { thread_id: langgraphThreadId, run_id } =
    config.configurable as unknown as AssumedConfigType;

  const llm = new ChatOpenAI({
    ...BASE_MODEL_CONFIG,
    tags: [Tags.COMMUNICATION],
  });

  const proposalsResult = await getProposalsOfThatRun(
    graphqlClient,
    langgraphThreadId,
    run_id,
  );
  let proposals: Array<DataChangeProposal> = [];

  if (Result.isFailure(proposalsResult)) {
    logger.error("Failed to get proposals of that run", {
      error: Result.unwrapFailure(proposalsResult),
    });
    proposals = [];
  } else {
    proposals = Result.unwrap(proposalsResult);
  }

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

#examples - when all changes that the user mentioned are listed
{examples}
#/examples

#examples - when some changes are missing
{examplesForMissingInformation}
#/examples

# List of changes (only for you to cross check if the user mentioned the same changes)
{listOfChanges}


Speak in {language}.

Drafted Response: {draftedResponse}
  `,
  ).format({
    examples: examples[preferredLanguage],
    examplesForMissingInformation:
      examplesForMissingInformation[preferredLanguage],
    listOfChanges: proposals.map((i) => i.description).join("\n"),
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
