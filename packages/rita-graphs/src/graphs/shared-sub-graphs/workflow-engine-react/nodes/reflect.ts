import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import {
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowEngineStateType } from "../sub-graph.js";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";
import { createLogger } from "@the-project-b/logging";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";

const MAX_REFLECTION_STEPS = 3;

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "WorkflowEngine",
  component: "Reflect",
});

/**
 * NOTE: I deactivated this node for now since it hardly helped.
 * We probably need to greatly improve the prompt or make it jump in in the end.
 */
export const reflect: WorkflowEngineNode = async (state, config) => {
  logger.info("🚀 Reflecting on the task", {
    operation: "reflect",
    threadId: config?.configurable?.thread_id || "unknown",
    reflectionStepCount: state.reflectionStepCount,
    maxReflectionSteps: MAX_REFLECTION_STEPS,
    companyId: state.selectedCompanyId,
  });

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

  const llm = new ChatOpenAI({ ...BASE_MODEL_CONFIG, temperature: 0.1 });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `
You are part of Payroll Specialist Assistant.
Your counterpart is using tools to solve the users request.

You are checking if the counterpart has come up with enough information or is missing the point.

{dataRepresentationLayerPrompt}

#guidelines:
- Don't be too strict and don't ask for information that the user has not asked for unless it is obviously missing.
- If not reflect on what information is missing or what is required to solve the users request.
- If the counter-part says its unable to find or provide the information then ACCEPT.
- If you already called IMPROVE multiple times it is time to ACCEPT, because the counterpart is not able to solve the users request.
#/guidelines

#examples
User: Change hours for John, Marie & Eric to 40 hours per week.
Counterpart: Here are John, Marie.
You: IMPROVE -> Find eric or explain mentioning why Eric is missing?
---------
User: Change hours for John, Marie & Eric to 40 hours per week.
Counterpart: Here are John, Marie but I could not find Eric.
You: ACCEPT
#/examples

You have been called IMPROVE for {reflectionStepCount}/2 times.

Respond in JSON format with the following fields:
- decision: ACCEPT or IMPROVE
- reflection: The suggestion for the counter-part if decision is IMPROVE
`,
  ).format({
    reflectionStepCount: state.reflectionStepCount,
    dataRepresentationLayerPrompt,
  });

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
      }),
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
