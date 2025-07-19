import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../graph-state.js";
//import { approveMutations as approveMutationsTools } from "../../../tools/index.js";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { Mutation } from "../../shared-types/base-annotation.js";

/**
 * This is a special node, responsible for matching the users request on pending mutations
 */
export const approveMutations: Node = async (state, config) => {
  console.log("🔨 Approve mutations");
  console.log("🔨 State", state);
  // Get the list of all pending mutations and let AI decide on which ones to approve

  //const tools = [approveMutationsTools()];
  const pendingMutations = state.mutations.filter(forPendingMutations);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.1 });

  const systemPrompt = await PromptTemplate.fromTemplate(
    `You are part of a Payroll Specialist Assistant.
Your job is to approve pending mutations by their id based on the user request.
Those are your pending mutations:
{pendingMutations}
    `
  ).format({
    pendingMutations: pendingMutations
      .map((m) => `ID: ${m.id} - ${m.description}`)
      .join("\n"),
  });

  const chatPrompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-4),
  ]).invoke({});

  const response = await llm.invoke(chatPrompt);

  const commands: Array<Command> = [];

  console.log("🔨 Tool calls", response.tool_calls);
  // handle the tool calls in the response
  const toolCalls = response.tool_calls;
  if (toolCalls) {
    for (const toolCall of toolCalls) {
      const tool = toolCall.name;
      const toolArgs = toolCall.args;

      if (tool === "approve_mutations") {
        /*
        commands.push(
          (await tools
            .find((t) => t.name === "approve_mutations")
            ?.invoke(toolArgs, config as any)) as Command
        );
        */
      }
    }
  }

  // We can only handle one mutation at a time
  const newMutations = (commands[0].update as any).mutations;

  const newSystemPrompt = await PromptTemplate.fromTemplate(
    `The user has approved the following mutations: {approvedMutations}.
Please inform him about the result. Keep the previous conversation in mind. 
If there are no mutations to approve, inform the user that there are no pending mutations.
If the conversation is completely off topic, inform the user that you are not able to handle this request.
`
  ).format({
    approvedMutations: newMutations
      .filter((m) => m.status === "approved")
      .map((m) => m.description)
      .join("\n "),
  });

  // Now inform the user that the mutations have been approved
  const finalChatPrompt = await ChatPromptTemplate.fromMessages([
    new SystemMessage(newSystemPrompt),
    ...state.messages.slice(-4),
  ]).invoke({});

  const finalResponse = await llm.invoke(finalChatPrompt);

  return {
    messages: [
      ...state.messages,
      new AIMessage(finalResponse.content.toString()),
    ],
    mutations: newMutations,
  };
};

// Mark: Private helpers

const forPendingMutations = (mutation: Mutation) =>
  mutation.status === "pending";
