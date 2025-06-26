import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowPlannerState } from "../sub-graph";

export const reflect: WorkflowEngineNode = async (state) => {
  console.log("🚀 Reflecting on the task");

  const lastUserMessage = state.messages
    .filter((i) => i instanceof HumanMessage)
    .at(-1);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const systemPrompt = PromptTemplate.fromTemplate(`
Your job is to be a Payroll Specialist and your counterpart has come up with a plan and called some tools
Check if the information collected is enough to solve the users request.
Don't be too strict and don't ask for information that the user has not asked for unless it is obviously missing.
If not reflect on what information is missing or what is required to solve the users request.

Respond in JSON format with the following fields:
- decision: ACCEPT or IMPROVE
- reflection: The reflection on the task if decision is IMPROVE
`);

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    ["system", await systemPrompt.format({})],
    lastUserMessage,
    ...state.taskEngineMessages,
  ]).invoke({});

  const response = await llm
    .withStructuredOutput(
      z.object({
        decision: z.enum(["ACCEPT", "IMPROVE"]),
        reflection: z.string().optional(),
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
  };
};

export function reflectionEdggeDecision(
  state: typeof WorkflowPlannerState.State
) {
  if (state.decision === "IMPROVE") {
    return "plan";
  }
  return "output";
}
