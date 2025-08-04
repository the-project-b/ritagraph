import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { WorkflowEngineNode } from "../sub-graph.js";
import { ChatOpenAI } from "@langchain/openai";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";

export const output: WorkflowEngineNode = async ({
  messages,
  taskEngineMessages,
}) => {
  console.log("🚀 Outputing the task");

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
