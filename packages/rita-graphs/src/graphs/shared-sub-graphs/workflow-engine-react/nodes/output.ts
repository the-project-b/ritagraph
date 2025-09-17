import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { WorkflowEngineNode } from "../sub-graph.js";
import { ChatOpenAI } from "@langchain/openai";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";
import { createLogger } from "@the-project-b/logging";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";
import { promptService } from "../../../../services/prompts/prompt.service.js";
import { Result } from "@the-project-b/prompts";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "WorkflowEngine",
  component: "Output",
});

export const output: WorkflowEngineNode = async (
  { messages, taskEngineMessages, selectedCompanyId },
  config,
) => {
  logger.info("🚀 Outputing the task", {
    operation: "output",
    threadId: config?.configurable?.thread_id || "unknown",
    taskEngineMessagesLength: taskEngineMessages.length,
    messagesLength: messages.length,
    companyId: selectedCompanyId,
  });

  const lastUserMessages = messages
    .filter((i) => i instanceof HumanMessage)
    .slice(-2);

  const llm = new ChatOpenAI({ ...BASE_MODEL_CONFIG, temperature: 0.1 });

  // Fetch prompt from LangSmith
  const rawPromptResult = await promptService.getRawPromptTemplate({
    promptName: "ritagraph-workflow-engine-output",
    source: "langsmith",
  });

  if (Result.isFailure(rawPromptResult)) {
    const error = Result.unwrapFailure(rawPromptResult);
    throw new Error(
      `Failed to fetch prompt 'ritagraph-workflow-engine-output' from LangSmith: ${error.message}`,
    );
  }

  const rawPrompt = Result.unwrap(rawPromptResult);
  const systemPrompt = await PromptTemplate.fromTemplate(
    rawPrompt.template,
  ).format({
    usersInitialMessage: lastUserMessages.map((i) => i.content).join("\n\n"),
    dataRepresentationLayerPrompt,
  });

  // Original hardcoded prompt - kept for reference
  // const systemPrompt = await PromptTemplate.fromTemplate(
  //   `
  // ### Users initial message
  // {usersInitialMessage}
  //
  // ### Guidelines
  // Extract all the relevant information from the previous thought process and tool calls.
  // Make sure you find and extract all the information that is relevant to the users request.
  //
  // The extracted information should also make the thought process understandable.
  //
  // ### placeholder rules
  // {dataRepresentationLayerPrompt}
  // `,
  // ).format({
  //   usersInitialMessage: lastUserMessages.map((i) => i.content).join("\n\n"),
  //   dataRepresentationLayerPrompt,
  // });

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...taskEngineMessages,
  ]).invoke({});

  const response = await llm.invoke(chatPrompt);

  return {
    workflowEngineResponseDraft: response.content.toString(),
    taskEngineMessages: [], // empty the taskEngineMessage chain
    taskEngineLoopCounter: 0, // reset the loop counter
  };
};
