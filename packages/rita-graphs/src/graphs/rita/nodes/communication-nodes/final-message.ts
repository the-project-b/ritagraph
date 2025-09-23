import { ChatOpenAI } from "@langchain/openai";
import { createLogger } from "@the-project-b/logging";
import { AssumedConfigType, Node } from "../../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { localeToLanguage } from "../../../../utils/format-helpers/locale-to-language.js";
import { onBaseMessages } from "../../../../utils/message-filter.js";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";
import { Tags } from "../../../tags.js";
import { appendMessageAsThreadItem } from "../../../../utils/append-message-as-thread-item.js";
import { Result } from "../../../../utils/types/result.js"; // idk, we could make a 'types' local package?
import { BASE_MODEL_CONFIG } from "../../../model-config.js";
import { promptService } from "../../../../services/prompts/prompt.service.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CommunicationNodes",
  node: "finalMessage",
});

const examples: Record<"EN" | "DE", string> = {
  EN: `
User: Please adjust the salary of [name] to 1000€ and [name] worked 40 hours this month.
Assistant: I could not propose the changes. Maybe the typo in the name of the users? Maybe you can try again and formulate it differntly? 
Let me know if you need anything else.
---------------------------------------
User: Please give me a list of all employees
Assistant: I have prepared a list of all employees.

<List id="[insert the id of the list here]">

Let me know if you need anything else.
  `,
  DE: `
Benutzer: Bitte passe das Gehalt von [Name] auf 1000€ an und [Name] hat diesen Monat 40 Stunden gearbeitet.
Assistent: Ich konnte die Änderungen vorbereiten. Vielleicht gibt es einen Tippfehler im Namen der Nutzer? Vielleicht kannst du es nochmal versuchen und es anders formulieren?
Lass mich wissen, ob ich dir noch weiterhelfen kann.
--------
Benutzer: Bitte gib mir eine Liste aller Mitarbeiter
Assistent: Ich habe eine Liste aller Mitarbeiter vorbereitet.

<List id="[insert the id of the list here]">

Lass mich wissen, ob ich dir noch weiterhelfen kann.
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
    agentActionLogger,
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
    ...BASE_MODEL_CONFIG,
    tags: [Tags.COMMUNICATION],
  });

  // We can assume that we have no change requests scheduled, it could also be an errors

  // Fetch prompt from LangSmith
  const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
    promptName: "ritagraph-final-message",
    source: "langsmith",
  });
  const systemPrompt = await PromptTemplate.fromTemplate(
    rawPrompt.template,
  ).format({
    examples: examples[preferredLanguage],
    dataRepresentationLayerPrompt,
    language: localeToLanguage(preferredLanguage),
    draftedResponse: workflowEngineResponseDraft,
  });

  // const systemPrompt = await PromptTemplate.fromTemplate(
  //   `You are a Payroll Specialist Assistant. Your job is to formulate the final response to the user.
  //
  // Guidelines:
  //  - Be concise but friendly.
  //  - Do not say "I will get back to you" or "I will send you an email" or anything like that.
  //  - If you could not find information say so
  //  - There will never be "pending" operations only thigns to be approved or rejected by the user.
  //  - Do not claim or say that there is an operation pending.
  //  - NEVER include ids like UUIDs in the response.
  //  - In german: NEVER use the formal "Sie" or "Ihre" always use casual "du" or "deine".
  //
  // #examples - For other cases like listing information
  // {examples}
  // #/examples
  //
  // {dataRepresentationLayerPrompt}
  //
  // Speak in {language}.
  //
  // Drafted Response: {draftedResponse}
  //   `,
  // ).format({
  //   examples: examples[preferredLanguage],
  //   dataRepresentationLayerPrompt,
  //   language: localeToLanguage(preferredLanguage),
  //   draftedResponse: workflowEngineResponseDraft,
  // });

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
    // Storing the logs for the next run
    agentActionEvents: agentActionLogger.getLogs(),
  };
};
