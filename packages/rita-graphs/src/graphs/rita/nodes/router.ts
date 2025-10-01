import { ChatOpenAI } from "@langchain/openai";
import { GraphStateType, Node } from "../graph-state.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import z from "zod";
import { SystemMessage } from "@langchain/core/messages";
import {
  onHumanAndAiMessage,
  onHumanMessage,
} from "../../../utils/message-filter.js";
import { BASE_MODEL_CONFIG } from "../../model-config.js";
import { promptService } from "../../../services/prompts/prompt.service.js";
import growthbookClient from "../../../utils/growthbook";

/**
 * Router is responsible for routing the request to the right agent.
 * Sometimes the user is just greeting or saying something casual, and it feels
 * bad if the agent takes ages to respond to it.
 */
export const router: Node = async (state) => {
  const llm = new ChatOpenAI({ ...BASE_MODEL_CONFIG, temperature: 0.1 });

  // Fetch prompt from LangSmith
  const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
    promptName: "ritagraph-router",
  });

  const systemPrompt = await PromptTemplate.fromTemplate(
    rawPrompt.template,
  ).format({});

  const prompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-6).filter(onHumanAndAiMessage),
  ]).invoke({});

  const response = await llm
    .withStructuredOutput(
      z.object({
        reasoning: z.string(),
        response: z.enum(["CASUAL_RESPONSE_WITHOUT_DATA", "WORKFLOW_ENGINE"]),
      }),
    )
    .invoke(prompt);

  return {
    routingDecision: response.response,
  };
};

const TODO_ENGINE_CHARACTER_THRESHOLD = 300;

export function routerEdgeDecision(state: GraphStateType) {
  const todoEngineEnabled = growthbookClient.isOn("todo-engine", {});

  if (state.routingDecision === "CASUAL_RESPONSE_WITHOUT_DATA") {
    return "quickResponse";
  }

  const lastHumanMessage = state.messages
    .filter(onHumanMessage)
    .at(-1)
    ?.content.toString();

  if (
    todoEngineEnabled &&
    lastHumanMessage?.length > TODO_ENGINE_CHARACTER_THRESHOLD
  ) {
    return "todoEngine";
  }

  if (state.routingDecision === "WORKFLOW_ENGINE") {
    return "workflowEngine";
  }

  return "workflowEngine";
}
