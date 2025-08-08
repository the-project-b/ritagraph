import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { WorkflowEngineNode } from "../sub-graph.js";
import { ChatOpenAI } from "@langchain/openai";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "WorkflowEngine",
  component: "Output",
});

export const output: WorkflowEngineNode = async (
  { messages, taskEngineMessages, selectedCompanyId },
  config
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

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.1 });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `
Extract all the relevant information from the previous thought process and tool calls.
Make sure you find and extract all the information that is relevant to the users request.
Put this into a brief response draft.

${dataRepresentationLayerPrompt}
`
  ).format({});

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...lastUserMessages,
    ...taskEngineMessages,
  ]).invoke({});

  const response = await llm.invoke(chatPrompt);

  return {
    workflowEngineResponseDraft: response.content.toString(),
    taskEngineMessages: [], // empty the taskEngineMessage chain
    taskEngineLoopCounter: 0, // reset the loop counter
  };
};
