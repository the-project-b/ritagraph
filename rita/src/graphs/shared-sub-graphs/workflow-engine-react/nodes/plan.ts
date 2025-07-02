import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { WorkflowEngineNode, WorkflowEngineStateType } from "../sub-graph.js";
import { AnnotationRoot } from "@langchain/langgraph";
import { ToolInterface } from "../../../shared-types/node-types.js";

export const plan: (
  fetchTools: (
    companyId: string,
    config: AnnotationRoot<any>
  ) => Promise<Array<ToolInterface>>
) => WorkflowEngineNode = (fetchTools) => async (state, config) => {
  console.log(
    "🚀 Plan - Chain of thought length [%s]",
    state.taskEngineMessages.length
  );

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 });

  const tools = await fetchTools(state.selectedCompanyId, config);

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

export function planEdgeDecision(state: WorkflowEngineStateType) {
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
