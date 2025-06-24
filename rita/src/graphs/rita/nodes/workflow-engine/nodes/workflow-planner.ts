/**
 * I acutally wanted to use a react agent however this turned out to be not working since
 * langgraph claims to support pre and post hooks for that agent but the typings tell a different story.
 * So I'm using a simple node for now.
 *
 * It is overoptimizing so far.
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { WorkflowEngineNode } from "../sub-graph";
import { getRelatedContext } from "../../../tools/get-related-context";

// Draft node - creates initial task descriptions
export const workflowPlanner: WorkflowEngineNode = async (state) => {
  console.log("📝 Draft Node - Creating initial task descriptions");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  // Get related context if available
  let context = "";
  try {
    const userRequest =
      state.messages[state.messages.length - 1]?.content || "";
    if (typeof userRequest === "string") {
      context = await getRelatedContext.invoke({ userRequest });
      console.log("🔍 Related context:", context);
    }
  } catch (error) {
    console.log("No related context found");
  }

  const userRequest = state.messages[state.messages.length - 1]?.content || "";

  const draftPrompt =
    PromptTemplate.fromTemplate(`Based on the user request, define tasks that will be executed by agents with database access.
Example tasks:
- Get all employees with salary greater than x.
- Of retrieved employees get me the amount of contracts they have.

{lastDraftAndImprovements}

User Request: {userRequest}
Related Context: {context}

Create a small list of task descriptions that need to be executed.`);

  const formattedPrompt = await draftPrompt.format({
    userRequest: typeof userRequest === "string" ? userRequest : "",
    lastDraftAndImprovements: `Last draft and improvements: \n${state.taskDescriptionsDraft} \nSuggestions: ${state.suggestion}`,
    context,
  });

  const response = await llm
    .withStructuredOutput(
      z.object({
        taskDescriptionsDraft: z.array(z.string()),
      })
    )
    .invoke(formattedPrompt);

  return {
    taskDescriptionsDraft: response.taskDescriptionsDraft,
    taskDescriptions: response.taskDescriptionsDraft,
    taskIndex: 0,
  };
};
