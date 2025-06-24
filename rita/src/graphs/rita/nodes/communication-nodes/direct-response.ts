import { ChatOpenAI } from "@langchain/openai";
import { Node } from "../../graph-state";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIMessage } from "@langchain/core/messages";

/**
 * At the moment just a pass through node
 */
export const directResponse: Node = async (state) => {
  console.log("💬 Direct Response - state:", state);

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a Payroll Specialist Assistant.
Acknowledge the user's request and inform them that you are going to work on it.
Example:
Thanks, I will get to work on x, give me a moment.
      `,
    ],
  ]);

  const response = await llm.invoke(await prompt.invoke(state.messages));

  return {
    messages: [...state.messages, new AIMessage(response.content.toString())],
  };
};
