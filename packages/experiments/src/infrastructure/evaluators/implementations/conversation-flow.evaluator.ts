import { createLogger } from "@the-project-b/logging";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import {
  TypedEvaluator,
  EvaluatorParams,
  EvaluationResult,
  EvaluationOptions,
  TrajectoryEvaluationInputs,
  TrajectoryEvaluationOutputs,
  TrajectoryEvaluationReferenceOutputs,
} from "../core/types.js";
import { promptService } from "../../services/prompt.service.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "ConversationFlowEvaluator",
});

const ConversationFlowEvaluationOutput = z.object({
  reasoning: z.string().describe("Detailed explanation of the evaluation"),
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Score between 0.0 and 1.0 (in 0.1 increments)"),
});

/**
 * Conversation Flow Evaluator
 *
 * Evaluates how well a multi-turn conversation followed the expected flow
 * and achieved the expected outcome. Uses LLM to perform detailed trajectory analysis.
 *
 * Compares:
 * - Expected conversation flow description vs actual trajectory
 * - Expected behaviors per turn vs actual responses
 * - Expected outcome vs final result
 */
export const conversationFlowEvaluator: TypedEvaluator<
  "CONVERSATION_FLOW",
  TrajectoryEvaluationInputs,
  TrajectoryEvaluationOutputs,
  TrajectoryEvaluationReferenceOutputs
> = {
  config: {
    type: "CONVERSATION_FLOW",
    name: "Conversation Flow",
    description:
      "Evaluates whether the multi-turn conversation followed the expected flow and achieved expected outcomes",
    defaultModel: "gpt-4o",
    supportsCustomPrompt: true,
    supportsReferenceKey: false,
  } as const,

  async evaluate(
    params: EvaluatorParams<
      TrajectoryEvaluationInputs,
      TrajectoryEvaluationOutputs,
      TrajectoryEvaluationReferenceOutputs
    >,
    options: EvaluationOptions = {},
  ): Promise<EvaluationResult> {
    const { customPrompt } = options;

    if (
      !params.referenceOutputs?.expectedConversationFlow &&
      !params.referenceOutputs?.expected_result_description
    ) {
      return {
        key: "conversation_flow",
        score: null,
        comment:
          "No expected conversation flow or outcome specified - skipping evaluation",
      };
    }

    let promptTemplate = customPrompt;
    if (!promptTemplate) {
      const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
        promptName: "experiments-evaluator-conversation-flow",
      });
      promptTemplate = rawPrompt.template;
    }

    const formattedTrajectory = params.outputs.conversationTrajectory
      ?.map((msg, idx) => {
        const turnInfo = msg.metadata?.turnNumber
          ? ` (Turn ${msg.metadata.turnNumber})`
          : "";
        return `${msg.role.toUpperCase()}${turnInfo}: ${msg.content}`;
      })
      .join("\n\n");

    const turnDetails = params.outputs.turnOutputs
      ?.map((turn) => {
        let detail = `Turn ${turn.turnNumber}:\n`;
        detail += `  User: ${turn.userMessage}\n`;
        detail += `  Assistant: ${turn.assistantResponse}`;
        if (turn.expectedBehavior) {
          detail += `\n  Expected Behavior: ${turn.expectedBehavior}`;
        }
        return detail;
      })
      .join("\n\n");

    const llm = new ChatOpenAI({
      model: "gpt-4o",
    });

    const prompt = await ChatPromptTemplate.fromTemplate(
      promptTemplate,
    ).invoke({
      expectedConversationFlow:
        params.referenceOutputs.expectedConversationFlow || "Not specified",
      expectedOutcome:
        params.referenceOutputs.expected_result_description || "Not specified",
      conversationTrajectory: formattedTrajectory || "No trajectory available",
      turnDetails: turnDetails || "No turn details available",
      turnCount: String(params.outputs.turnOutputs?.length ?? 0),
      expectedTurnCount: String(
        params.referenceOutputs.expectedTurnCount ?? "Not specified",
      ),
    });

    const response = await llm
      .withStructuredOutput<z.infer<typeof ConversationFlowEvaluationOutput>>(
        ConversationFlowEvaluationOutput,
      )
      .invoke(prompt);

    const { score, reasoning } = response;

    if (typeof score !== "number" || score < 0 || score > 1) {
      throw new Error(
        `Invalid score returned: ${score}. Expected number between 0.0 and 1.0`,
      );
    }

    return {
      key: "conversation_flow",
      score,
      comment: reasoning || "",
    };
  },
};
