import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { HumanMessage } from "@langchain/core/messages";
import { WorkflowEngineNode } from "../sub-graph";
import { ChatOpenAI } from "@langchain/openai";

export const output: WorkflowEngineNode = async (state) => {
  console.log("🚀 Outputing the task");

  const lastUserMessages = state.messages
    .filter((i) => i instanceof HumanMessage)
    .slice(-2);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const systemPrompt = PromptTemplate.fromTemplate(`
Extract all the relevant information from the previous thought process and tool calls.
Make sure you find and extract all the information that is relevant to the users request.
Put this into a brief response draft.
`);

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    ["system", await systemPrompt.format({})],
    ...state.taskEngineMessages,
    ...lastUserMessages,
  ]).invoke({});

  const response = await llm.invoke(chatPrompt);

  return {
    workflowEngineResponseDraft: response.content.toString(),
  };
};
