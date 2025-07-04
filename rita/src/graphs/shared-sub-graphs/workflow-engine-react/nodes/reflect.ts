import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import {
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowEngineStateType } from "../sub-graph.js";

const MAX_REFLECTION_STEPS = 3;

export const reflect: WorkflowEngineNode = async (state) => {
  console.log("🚀 Reflecting on the task");

  if (state.reflectionStepCount >= MAX_REFLECTION_STEPS) {
    return {
      decision: "ACCEPT",
      taskEngineMessages: [],
      reflectionStepCount: 0,
    };
  }

  const lastUserMessage = state.messages
    .filter((i) => i instanceof HumanMessage)
    .at(-1);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.1 });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `
Your job is to be a Payroll Specialist and your counterpart has come up with a plan and called some tools
Check if the information collected is enough to solve the users request.
Don't be too strict and don't ask for information that the user has not asked for unless it is obviously missing.
If not reflect on what information is missing or what is required to solve the users request.
If the agent says its unable to find or provide the information then ACCEPT.

Respond in JSON format with the following fields:
- decision: ACCEPT or IMPROVE
- reflection: The reflection on the task if decision is IMPROVE
`
  ).format({});

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    lastUserMessage,
    ...state.taskEngineMessages, //todo safely slice last 5 messages
  ]).invoke({});

  const response = await llm
    .withStructuredOutput(
      z.object({
        decision: z.enum(["ACCEPT", "IMPROVE"]),
        reflection: z.string(),
      })
    )
    .invoke(chatPrompt);

  const taskEngineMessages =
    response.decision === "IMPROVE"
      ? [new AIMessageChunk(response.reflection)]
      : [];

  return {
    decision: response.decision,
    taskEngineMessages,
    reflectionStepCount: state.reflectionStepCount + 1,
  };
};

export function reflectionEdggeDecision(state: WorkflowEngineStateType) {
  if (state.decision === "IMPROVE") {
    return "plan";
  }
  return "output";
}
