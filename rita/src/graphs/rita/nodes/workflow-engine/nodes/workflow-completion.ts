import { ChatOpenAI } from "@langchain/openai";
import { WorkflowEngineNode } from "../sub-graph";
import { PromptTemplate } from "@langchain/core/prompts";
import { getConversationWithRedactedAssistantMessages } from "../../../../../utils/format-helpers/message-filters";

export const workflowCompletion: WorkflowEngineNode = async (state) => {
  console.log("✅ Workflow Completion - Creating final summary");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const completionPrompt = PromptTemplate.fromTemplate(`
Based on the task execution results, extract the relevant information the user asked for.

Last user Messages:
{filteredMessages}

Task Execution Log:
{taskExecutionLog}
  `);

  const formattedPrompt = await completionPrompt.format({
    taskExecutionLog: JSON.stringify(state.taskExecutionLog || [], null, 2),
    filteredMessages: getConversationWithRedactedAssistantMessages(
      state.messages,
      5
    ), // last 5 messages
  });

  const response = await llm.invoke(formattedPrompt);

  return {
    draftedResponse: response.content.toString(),
  };
};
