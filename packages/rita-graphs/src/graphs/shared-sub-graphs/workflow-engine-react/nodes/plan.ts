import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  AIMessage,
  AIMessageChunk,
  SystemMessage,
} from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowEngineStateType } from "../sub-graph.js";
import { AnnotationRoot } from "@langchain/langgraph";
import { ToolInterface } from "../../../shared-types/node-types.js";
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
import { promptService } from "../../../../services/prompts/prompt.service.js";
import AgentActionLogger from "../../../../utils/agent-action-logger/AgentActionLogger.js";
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

export const plan: (
  fetchTools: (
    companyId: string,
    config: AnnotationRoot<any>,
    agentActionLogger: AgentActionLogger,
  ) => Promise<Array<ToolInterface>>,
) => WorkflowEngineNode =
  (fetchTools) =>
  async (
    {
      messages,
      taskEngineMessages,
      taskEngineLoopCounter,
      selectedCompanyId,
      preferredLanguage,
      agentActionLogger,
      sanitizedUserRequest,
    },
    config,
    getAuthUser,
  ) => {
    logger.info(
      `🚀 Plan - Chain of thought length [${taskEngineMessages.length}]`,
      {
        operation: "plan",
        threadId: config?.configurable?.thread_id || "unknown",
        taskEngineMessagesLength: taskEngineMessages.length,
        taskEngineLoopCounter,
        companyId: selectedCompanyId,
      },
    );

    // Check if the taskEngineLoopCounter is greater than max and then return early (to prevent additonal tool calls)
    if (taskEngineLoopCounter > MAX_TASK_ENGINE_LOOP_COUNTER) {
      return {};
    }

    const llm = new ChatOpenAI({ ...BASE_MODEL_CONFIG, temperature: 0.2 });

    const tools = await fetchTools(
      selectedCompanyId,
      config,
      agentActionLogger,
    );

    const lastUserMessages = messages
      .filter(onNoThoughtMessages)
      .filter(onHumanAndAiMessage)
      .slice(-1);

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
    const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
      promptName: "ritagraph-workflow-engine-plan",
    });
    const systemPrompt = await PromptTemplate.fromTemplate(
      rawPrompt.template,
    ).format({
      examplesForMeaningsOfRequests:
        examplesForMeaningsOfRequests[preferredLanguage],
      dataRepresentationLayerPrompt,
    });

    const chatPrompt = await ChatPromptTemplate.fromMessages([
      new SystemMessage(systemPrompt),
      ...lastUserMessages,
      new AIMessage(`
Sanitized version of the user request: \n ${sanitizedUserRequest}
        `),
      ...taskEngineMessages, //todo safely slice last 7 messages
      new AIMessage(getLiveViewOfProposedChanges(dataChangeProposals)),
    ]).invoke({});

    const response = await llm.bindTools(tools).invoke(chatPrompt);

    return {
      taskEngineMessages: [response],
      taskEngineLoopCounter: taskEngineLoopCounter + 1,
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
