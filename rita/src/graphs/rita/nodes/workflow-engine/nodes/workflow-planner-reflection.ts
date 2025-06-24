import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import z from "zod";
import { WorkflowEngineNode } from "../sub-graph";

// Reflection node - reviews and either accepts or suggests improvements
export const reflectionNode: WorkflowEngineNode = async (state) => {
  console.log("🤔 Reflection Node - Reviewing draft tasks");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const userRequest = state.messages[state.messages.length - 2]?.content || "";

  const reflectionPrompt = PromptTemplate.fromTemplate(`
Your job is to review the task descriptions for agents that retrieve data from the database.
The task descriptions should not be technical, rather describe what the user wants to do.

User Request: {userRequest}
Draft Tasks: {draftTasks}
Your previous suggestion: {suggestion}

Respond with either as JSON format:
- "ACCEPT" if the tasks are good to proceed with
- "IMPROVE" followed by specific suggestions if improvements are needed

Improve when the tasks do not seem to be solving the user's request.
Improve if the tasks seems to be too complex or many. Often a few are enough.
Improve if the tasks cover more then what the user asked for.
Accept if the tasks seem good to proceed with if they essentially solve the user's request.
`);

  const formattedPrompt = await reflectionPrompt.format({
    userRequest: typeof userRequest === "string" ? userRequest : "",
    draftTasks: JSON.stringify(state.taskDescriptions),
    suggestion: state.suggestion || "No previous suggestion",
  });

  const response = await llm
    .withStructuredOutput(
      z.object({
        decision: z.enum(["ACCEPT", "IMPROVE"]),
        improvements: z.string().optional(),
      })
    )
    .invoke(formattedPrompt);

  console.log(response);

  if (response.decision === "ACCEPT" || state.reflectionLoopCounter >= 2) {
    console.log("✅ Tasks accepted - proceeding to execution");
    return {
      decision: "ACCEPT",
      taskDescriptions: state.taskDescriptionsDraft,
    };
  } else {
    console.log("🔄 Tasks need improvement - returning to draft");
    return {
      decision: "IMPROVE",
      suggestion: response.improvements,
      reflectionLoopCounter: (state.reflectionLoopCounter || 0) + 1,
    };
  }
};
