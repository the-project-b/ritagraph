import { ChatOpenAI } from "@langchain/openai";
import { GraphStateType, Node } from "../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import z from "zod";
import { SystemMessage } from "@langchain/core/messages";
import { onBaseMessages } from "../../../utils/message-filter.js";

/**
 * Router is responsible for routing the request to the right agent.
 * Sometimes the user is just greeting or saying something casual, and it feels
 * bad if the agent takes ages to respond to it.
 */
export const router: Node = async (state) => {
  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `
You are a payroll specialist and part of a bigger system.
Your job is to route the requests to the right agent
Add your reasoning to the response.
respond in JSON with:
- CASUAL_RESPONSE_WITHOUT_DATA when the user is not requesting anything and is just greeting or saying goodbye
- WORKFLOW_ENGINE for anything else that requires a real answer or context or a tool call

Further cases for the WORKFLOW_ENGINE: Talking about approval of mutations or anything that is not casual.
If the user is approving of something you should use the WORKFLOW_ENGINE.
  `
  ).format({});

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-3).filter(onBaseMessages),
  ]).invoke({});

  const response = await llm
    .withStructuredOutput(
      z.object({
        reasoning: z.string(),
        response: z.enum(["CASUAL_RESPONSE_WITHOUT_DATA", "WORKFLOW_ENGINE"]),
      })
    )
    .invoke(prompt);

  return {
    routingDecision: response.response,
  };
};

export function routerEdgeDecision(state: GraphStateType) {
  if (state.routingDecision === "CASUAL_RESPONSE_WITHOUT_DATA") {
    return "quickResponse";
  }

  if (state.routingDecision === "WORKFLOW_ENGINE") {
    return "workflowEngine";
  }

  return "workflowEngine";
}
