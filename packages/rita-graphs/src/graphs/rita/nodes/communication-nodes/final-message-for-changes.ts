import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import {
  onBaseMessages,
  onNoThoughtMessages,
} from "../../../../utils/message-filter.js";
import { Tags } from "../../../tags.js";
import { appendMessageAsThreadItem } from "../../../../utils/append-message-as-thread-item.js";
import { Result } from "../../../../utils/types/result.js";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";
import { createGraphQLClient } from "../../../../utils/graphql/client.js";
import { DataChangeProposal } from "../../../shared-types/base-annotation.js";
import { getProposalsOfThatRun } from "./final-message-edge-decision.js";
import { promptService } from "../../../../services/prompts/prompt.service.js";
import {
  getRunIdFromConfig,
  getThreadIdFromConfig,
} from "../../../../utils/config-helper.js";
import AgentActionLogger, {
  AgentActionType,
  AgentLogEventTag,
} from "../../../../utils/agent-action-logger/AgentActionLogger.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CommunicationNodes",
  node: "finalMessage",
});

const examples: Record<"EN" | "DE", (numberOfChanges: number) => string> = {
  EN: (numberOfChanges) => `
I have read your request and proposed **one data change**.
Please review them and approve or reject them.
Let me know if you need anything else.
--------
I have read your request and proposed **${numberOfChanges} data changes**.
Please review them and approve or reject them.
Let me know if you need anything else.

  `,
  DE: (numberOfChanges) => `
Ich habe aus deiner Nachricht diesen **einen Änderungsvorschläg** ausgelesen.
Bitte überprüfe diese und nehme sie gegebenfalls an.
Lass mich wissen ob ich dir noch helfen kann.
--------
Ich habe aus deiner Nachricht diese **${numberOfChanges} Änderungsvorschläge** ausgelesen.
Bitte überprüfe diese und nehme sie gegebenfalls an.
Lass mich wissen ob ich dir noch helfen kann.
  `,
};

const examplesForMissingInformation: Record<
  "EN" | "DE",
  (numberOfChanges: number) => string
> = {
  EN: (numberOfChanges) => `
I have read your request and proposed **${numberOfChanges} data changes**.
However I had problem with [change description], can you try that again?
Please review the rest of the changes and approve or reject them.
Let me know if you need anything else.
  `,
  DE: (numberOfChanges) => `
Ich habe deine Anfrage gelesen und habe **${numberOfChanges} Änderungsvorschläge** vorgeschlagen.
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
    agentActionLogger,
    rolesRitaShouldBeVisibleTo,
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

  const runId = getRunIdFromConfig(config);
  const langgraphThreadId = getThreadIdFromConfig(config);

  const llm = new ChatOpenAI({
    ...BASE_MODEL_CONFIG,
    tags: [Tags.COMMUNICATION],
  });

  const proposalsResult = await getProposalsOfThatRun(
    graphqlClient,
    langgraphThreadId,
    runId,
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

  // Fetch prompt from LangSmith
  const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
    promptName: "ritagraph-final-message-for-changes",
  });

  const numberOfProposals = proposals.length;

  const systemPrompt = await PromptTemplate.fromTemplate(
    rawPrompt.template,
  ).format({
    examples: examples[preferredLanguage](numberOfProposals),
    examplesForMissingInformation:
      examplesForMissingInformation[preferredLanguage](numberOfProposals),
    agentLogs: formatProposalRelatedLogs(agentActionLogger, runId),
    listOfChanges: proposals.map((i) => i.description).join("\n"),
    language: localeToLanguage(preferredLanguage),
    draftedResponse: workflowEngineResponseDraft,
    amountOfChangeProposals: numberOfProposals,
    openQuestionsOfTheAgent: formatAgentQuestionsFromLogs(
      agentActionLogger,
      runId,
    ),
  });

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...messages.filter(onNoThoughtMessages).slice(-3).filter(onBaseMessages),
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
      rolesRitaShouldBeVisibleTo,
    },
    rolesRitaShouldBeVisibleTo,
    ownerId: null,
    runId,
  });

  if (Result.isFailure(appendMessageResult)) {
    logger.error("Failed to append message as thread item", {
      error: Result.unwrapFailure(appendMessageResult),
    });
  }

  return {
    messages: [...messages, responseMessage],
    // Storing the logs for the next run
    agentActionEvents: agentActionLogger.getLogs(),
  };
};

function formatAgentQuestionsFromLogs(
  logger: AgentActionLogger,
  runId: string,
): string {
  const logs = logger.getLogsOfRun(runId);
  const agentQuestions = logs.filter(
    (log) => log.actionType === AgentActionType.AGENT_QUESTION_TO_USER,
  );

  return agentQuestions.map((i) => i.description).join("\n");
}

function formatProposalRelatedLogs(
  logger: AgentActionLogger,
  runId: string,
): string {
  const logs = logger.getLogsOfRun(runId);
  const proposalRelatedLogs = logs.filter(
    (log) =>
      log.actionType === AgentActionType.TOOL_CALL_ENTER &&
      log.tags?.includes(AgentLogEventTag.DATA_CHANGE_PROPOSAL),
  );

  const groupedLogs = proposalRelatedLogs
    .map((log) =>
      logger
        .getRelatedLogs(log.relationId)
        .map((log) => log.description)
        .join("\n"),
    )
    .join("\n\n");

  return groupedLogs;
}
