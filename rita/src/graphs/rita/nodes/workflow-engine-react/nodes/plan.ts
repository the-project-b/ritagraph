import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowPlannerState } from "../sub-graph.js";
import mcpClient from "../../../../../mcp/client.js";

export const plan: WorkflowEngineNode = async (state, config) => {
  console.log("🚀 Plan - Planning the task");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const tools = await mcpClient.getTools(); // No auth wrapper needed, just load the tools so they know which ones exist

  const lastUserMessage = state.messages
    .filter((i) => i instanceof HumanMessage)
    .slice(-1);

  const systemPropmt = PromptTemplate.fromTemplate(`
You are a Payroll Specialist and a planning agent that calls tools to solve the users request.
You plan based on previous results and try to solve the users request in the most efficient way.

Your job is to:
1. Analyze the user's request carefully
2. Define what the user is asking for and step by step use tools to get the information
3. Consider dependencies between steps
4. Make the plan actionable and specific

Guidelines:
- Break complex requests into smaller, manageable steps
- Be specific about what tools to use and why
- Consider what information you need to gather first
- Plan for potential follow-up actions based on initial results
- Keep steps focused and clear

Format your plan as a numbered list of specific actions.`);

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    ["system", await systemPropmt.format({})],
    ...lastUserMessage,
    ...state.taskEngineMessages.slice(-7),
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
