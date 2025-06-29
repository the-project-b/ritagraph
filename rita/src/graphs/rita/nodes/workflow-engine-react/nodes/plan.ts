import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowPlannerState } from "../sub-graph.js";
import mcpClient from "../../../../../mcp/client.js";
import { safelySliceMessages } from "../../../../../utils/message-reducer/safely-slice-messages.js";

export const plan: WorkflowEngineNode = async (state, config) => {
  console.log("🚀 Plan - Planning the task");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const tools = await mcpClient.getTools(); // No auth wrapper needed, just load the tools so they know which ones exist

  const lastUserMessage = state.messages
    .filter((i) => i instanceof HumanMessage)
    .slice(-1);

  const systemPropmt = PromptTemplate.fromTemplate(`
You are a Payroll Specialist and a ReAct agent that calls tools to solve the users request.
You act based on previous results and try to solve the users request in the most efficient way.

Your job is to:
1. Analyze the user's request carefully
2. Check if you have enough information to solve the users request
3. Define a next step (e.g. tool call) to gain the missing information
4. Consider dependencies between steps

Guidelines:
- Break complex requests into smaller, manageable steps
- Be specific about what tools to use and why
- Consider what information you need to gather first
- Briefly Outline for potential follow-up actions based on initial results
- Keep steps focused and clear
- Try to only do one step at a time

Format your plan as a numbered list of specific actions.`);

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    ["system", await systemPropmt.format({})],
    ...lastUserMessage,
    ...state.taskEngineMessages, //todo safely slice last 7 messages
  ]).invoke({});

  const response = await llm.bindTools(tools).invoke(chatPrompt);

  return {
    taskEngineMessages: [response],
  };
};

export function planEdgeDecision(state: typeof WorkflowPlannerState.State) {
  // Check if we have pending tool calls that need to be executed
  const lastMessage =
    state.taskEngineMessages[state.taskEngineMessages.length - 1];
  const hasPendingToolCalls =
    lastMessage instanceof AIMessageChunk &&
    lastMessage.tool_calls &&
    lastMessage.tool_calls.length > 0;

  // If we have pending tool calls, go to tools
  if (hasPendingToolCalls) {
    return "tools";
  }

  return "reflect";
}
