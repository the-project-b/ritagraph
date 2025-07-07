import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { WorkflowEngineNode } from "../sub-graph.js";
import { ChatOpenAI } from "@langchain/openai";

export const output: WorkflowEngineNode = async (state) => {
  console.log("🚀 Outputing the task");

  const lastUserMessages = state.messages
    .filter((i) => i instanceof HumanMessage)
    .slice(-2);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.1 });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `
Drafting guidelines:
- Extract all the relevant information from the previous thought process and tool calls.
- Make sure you find and extract all the information that is relevant to the users request.
- If tool calls provide data in tables try to keep the table structure.

Put this into a brief response draft.
`
  ).format({});

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...state.taskEngineMessages,
    ...lastUserMessages,
  ]).invoke({});

  const response = await llm.invoke(chatPrompt);

  return {
    workflowEngineResponseDraft: response.content.toString(),
  };
};
