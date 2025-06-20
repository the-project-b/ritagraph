import { Node } from "../graph-state";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";

/**
 * Temp Agent - through away node just for setup
 */
export const tempAgent: Node = async (state) => {
  // Create a simple OpenAI model instance
  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.1,
  });

  // Create a helpful system prompt
  const systemPrompt = `You are a helpful AI assistant. Your goal is to be friendly, informative, and assist the user with their requests. 
  
  Guidelines:
  - Be concise but thorough
  - Ask clarifying questions when needed
  - Provide actionable advice
  - Be encouraging and supportive`;

  // Prepare messages for the LLM
  const messages = [
    { role: "system", content: systemPrompt },
    ...state.messages.slice(-5),
  ];

  try {
    // Make the LLM call
    const response = await model.invoke(messages);

    // Return the response as a command
    return new Command({
      update: {
        messages: [...state.messages, response],
      },
    });
  } catch (error) {
    console.error("Error in initialPlanNode:", error);

    // Return a fallback message if the LLM call fails
    const fallbackMessage = new AIMessage({
      content:
        "I apologize, but I'm having trouble processing your request right now. Could you please try again?",
    });

    return new Command({
      update: {
        messages: [...state.messages, fallbackMessage],
      },
    });
  }
};
