import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowEngineStateType } from "../sub-graph.js";
import { AnnotationRoot } from "@langchain/langgraph";
import { ToolInterface } from "../../../shared-types/node-types.js";
import { dataRepresentationLayerPrompt } from "../../../../utils/data-representation-layer/prompt-helper.js";
import { createLogger } from "@the-project-b/logging";

const MAX_TASK_ENGINE_LOOP_COUNTER = 10;

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "WorkflowEngine",
  component: "Plan",
});

export const plan: (
  fetchTools: (
    companyId: string,
    config: AnnotationRoot<any>,
  ) => Promise<Array<ToolInterface>>,
) => WorkflowEngineNode =
  (fetchTools) =>
  async (
    { messages, taskEngineMessages, taskEngineLoopCounter, selectedCompanyId },
    config,
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

    const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 });

    const tools = await fetchTools(selectedCompanyId, config);

    const lastUserMessage = messages
      .filter((i) => i.getType() === "human")
      .slice(-2);

    const systemPropmt = await PromptTemplate.fromTemplate(
      `
You are a Payroll Specialist and a ReAct agent that solves user requests by interacting with tools.

# Responsibilities

1. Understand the user's request
   - Carefully analyze the query.
   - Identify whether additional information is needed.

2. Plan your actions
   - Break the task into clear, manageable steps.
   - Be specific about what to do next and which tool to use.
   - Consider dependencies between steps (e.g., information needed for later actions).

3. Act step-by-step
   - Perform only one action at a time.
   - After each action, reassess whether you now have enough information to proceed.

4. Use tools deliberately
   - Choose tools based on the current step.
   - Only call a tool if it's clearly required for that step.

## Guides for data changes
- If the request states e.g. "Starting september:..." and then lists changes it means that those changes should be effective on the first day of september.
- Please make sure its part of the quote.
- If you ommit parts in a quote please indicate this with "[...]". (e.g. Starting september [...] Robby works 20 hours [...] (Software Architect contract))

${dataRepresentationLayerPrompt}

Format Your Thoughts

Always format your reasoning like this:

Thought: Based on [observation], I think we should [action] in order to [goal].

Then, take the next action (e.g., call a tool or or finalize the response).
`,
    ).format({});

    const chatPrompt = await ChatPromptTemplate.fromMessages([
      new SystemMessage(systemPropmt),
      ...lastUserMessage,
      ...taskEngineMessages, //todo safely slice last 7 messages
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
  return "reflect";
}
