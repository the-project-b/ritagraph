import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  AIMessage,
  AIMessageChunk,
  SystemMessage,
} from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowEngineStateType } from "../sub-graph.js";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";
import { createLogger } from "@the-project-b/logging";
import { BASE_MODEL_CONFIG } from "../../../model-config.js";
import {
  onHumanAndAiMessage,
  onNoThoughtMessages,
} from "../../../../utils/message-filter.js";
import { getCurrentDataChangeProposals } from "../../../../utils/fetch-helper/get-current-data-change-proposals.js";
import { createGraphQLClient } from "../../../../utils/graphql/client.js";
import { AssumedConfigType } from "../../../rita/graph-state.js";
import { getLiveViewOfProposedChanges } from "../utils/proposal-format-helper.js";

const MAX_TASK_ENGINE_LOOP_COUNTER = 10;

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "WorkflowEngine",
  component: "Plan",
});

const examplesForMeaningsOfRequests: Record<"EN" | "DE", string> = {
  EN: `
User: Hi Rita, here is August, Moore 49, William 50, Evelyn 34. Best regards, Sonja
Means: The user lists the monthly hours of the employees. Adjust their monthly hours for the given month. Make sure to only apply that to base wages not salaries.
  `,
  DE: `
User: Hi Rita, hier der August, Moore 49, William 50, Evelyn 34 VG Sonja
Means: The user lists the monthly hours of the employees. Adjust their monthly hours for the given month. Make sure to only apply that to base wages not salaries.
  `,
};

export const extractRequest: WorkflowEngineNode = async (
  { messages, taskEngineMessages, taskEngineLoopCounter },
  config,
  getAuthUser,
) => {
  logger.info(`🚀 ExtractRequest`, {
    operation: "extractRequest",
    threadId: config?.configurable?.thread_id || "unknown",
    taskEngineMessagesLength: taskEngineMessages.length,
    taskEngineLoopCounter,
  });
  const llm = new ChatOpenAI({ ...BASE_MODEL_CONFIG, temperature: 0.2 });

  const lastUserMessages = messages
    .filter(onNoThoughtMessages)
    .filter(onHumanAndAiMessage)
    .slice(-5);

  const { thread_id: langgraphThreadId } =
    config.configurable as unknown as AssumedConfigType;
  const { token: accessToken, appdataHeader } = getAuthUser(config);

  const client = createGraphQLClient({
    accessToken,
    appdataHeader,
  });

  const dataChangeProposals = await getCurrentDataChangeProposals(
    langgraphThreadId,
    client,
  );

  // Fetch prompt from LangSmith
  /*
  const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
    promptName: "ritagraph-workflow-engine-plan",
    source: "langsmith",
  });
  */
  const systemPrompt = await PromptTemplate.fromTemplate(
    `You are a payroll specialist assistant.
Your are part of a bigger payrol agent system. 
Your job is to create a sanitized version of the users request.
This means understand what the last users message really means in context of the previous messages and the state
and create a sanitized version to reduce any misunderstandings.

# Guidelines
 - If something is already proposed do not repropose it - unless the last message explicitly asks for it.
 - If the last message has nothing to do with the previous messages and the state -> do not include it in the sanitized version.
 - Make sure to use the conversation flow to understand what the users request is.
 - Keep it brief and to the point.
 - If it is relevant for the new request include details of the previous requests but not instruct the same proposal twice.
 - e.g. If you just change the date of a proposal then include the other details with the new date. But not other proposals that are unrelated.
 - IMPORTANT: You are not responding to the user but you are creating a sanitized version of the users request.


# Context:
{listOfDataChangeProposals}

DO NOT RESPOND TO THE USER. You are creating a sanitized version of the users request.
DO NOT RESPOND TO THE USER. You are creating a sanitized version of the users request.
    `,
  ).format({
    listOfDataChangeProposals:
      getLiveViewOfProposedChanges(dataChangeProposals),
    dataRepresentationLayerPrompt,
  });

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...lastUserMessages,
  ]).invoke({});

  const response = await llm.invoke(chatPrompt);

  return {
    sanitizedUserRequest: response.content.toString(),
  };
};

export function planEdgeDecision(state: WorkflowEngineStateType) {
  if (state.taskEngineLoopCounter > MAX_TASK_ENGINE_LOOP_COUNTER) {
    return "abortOutput";
  }

  // Check if we have pending tool calls that need to be executed
  const lastMessage =
    state.taskEngineMessages[state.taskEngineMessages.length - 1];
  const hasPendingToolCalls =
    (lastMessage instanceof AIMessageChunk ||
      lastMessage instanceof AIMessage) &&
    lastMessage.tool_calls &&
    lastMessage.tool_calls.length > 0;
  // If we have pending tool calls, go to tools
  if (hasPendingToolCalls) {
    return "tools";
  }
  return "output";
}
