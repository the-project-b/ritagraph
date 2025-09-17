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
  component: "AbortOutput",
});

/**
 * The idea of this node is to be a special case of the output node.
 * Sometimes the planning agent might already have found most of the required information
 * but still tries to find the right remaining 1%. In this case we abort at some point to prevent
 * recursion limits.
 */
export const abortOutput: WorkflowEngineNode = async (
  { messages, taskEngineMessages, selectedCompanyId },
  config,
) => {
  logger.info("🚀 Outputing the task (abort case)", {
    operation: "abortOutput",
    threadId: config?.configurable?.thread_id || "unknown",
    taskEngineMessagesLength: taskEngineMessages.length,
    messagesLength: messages.length,
    reason: "max_loops_reached",
    companyId: selectedCompanyId,
  });

  const lastUserMessages = messages
    .filter((i) => i instanceof HumanMessage)
    .slice(-2);

  const llm = new ChatOpenAI({ ...BASE_MODEL_CONFIG, temperature: 0.1 });

  // Fetch prompt from LangSmith
  const rawPromptResult = await promptService.getRawPromptTemplate({
    promptName: "ritagraph-workflow-engine-abort-output",
    source: "langsmith",
  });

  if (Result.isFailure(rawPromptResult)) {
    const error = Result.unwrapFailure(rawPromptResult);
    throw new Error(
      `Failed to fetch prompt 'ritagraph-workflow-engine-abort-output' from LangSmith: ${error.message}`,
    );
  }

  const rawPrompt = Result.unwrap(rawPromptResult);
  const systemPrompt = await PromptTemplate.fromTemplate(
    rawPrompt.template,
  ).format({
    dataRepresentationLayerPrompt,
  });

  // const systemPrompt = await PromptTemplate.fromTemplate(
  //   `
  // The previous agent has ran its maximum number of loops.
  // Extract all the relevant information from the previous thought process and tool calls.
  // Make sure you find and extract all the information that is relevant to the users request.
  // In case the agent has not found parts or all of the required information, explain what is missing
  // and that you could not retrieve it.
  //
  // {dataRepresentationLayerPrompt}
  //
  // Put this into a brief response draft.
  // `,
  // ).format({
  //   dataRepresentationLayerPrompt,
  // });

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...taskEngineMessages,
    ...lastUserMessages,
  ]).invoke({});

  const response = await llm.invoke(chatPrompt);

  return {
    workflowEngineResponseDraft: response.content.toString(),
    taskEngineMessages: [], // empty the taskEngineMessage chain
    taskEngineLoopCounter: 0, // reset the loop counter
  };
};
