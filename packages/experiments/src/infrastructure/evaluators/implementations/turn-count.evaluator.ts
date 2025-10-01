import {
  TypedEvaluator,
  EvaluatorParams,
  EvaluationResult,
  EvaluationOptions,
  TrajectoryEvaluationInputs,
  TrajectoryEvaluationOutputs,
  TrajectoryEvaluationReferenceOutputs,
} from "../core/types.js";

/**
 * Turn Count Evaluator
 *
 * Validates that a multi-turn conversation took the expected number of turns.
 * This is a simple counting evaluator that doesn't require LLM evaluation.
 *
 * Score: 1.0 if actual turn count matches expected, 0.0 otherwise
 */
export const turnCountEvaluator: TypedEvaluator<
  "TURN_COUNT",
  TrajectoryEvaluationInputs,
  TrajectoryEvaluationOutputs,
  TrajectoryEvaluationReferenceOutputs
> = {
  config: {
    type: "TURN_COUNT",
    name: "Turn Count",
    description:
      "Evaluates whether the conversation took the expected number of turns",
    defaultModel: "openai:gpt-4o-mini",
    supportsCustomPrompt: false,
    supportsReferenceKey: false,
  } as const,

  async evaluate(
    params: EvaluatorParams<
      TrajectoryEvaluationInputs,
      TrajectoryEvaluationOutputs,
      TrajectoryEvaluationReferenceOutputs
    >,
    _options: EvaluationOptions = {},
  ): Promise<EvaluationResult> {
    const actualTurnCount = params.outputs.turnOutputs?.length ?? 0;
    const expectedTurnCount = params.referenceOutputs?.expectedTurnCount;

    // If no expected turn count specified, skip evaluation
    if (expectedTurnCount === undefined || expectedTurnCount === null) {
      return {
        key: "turn_count",
        score: null,
        comment: "No expected turn count specified - skipping evaluation",
      };
    }

    const matches = actualTurnCount === expectedTurnCount;
    const score = matches ? 1.0 : 0.0;

    return {
      key: "turn_count",
      score,
      comment: matches
        ? `✓ Conversation took expected ${expectedTurnCount} turns`
        : `✗ Expected ${expectedTurnCount} turns but got ${actualTurnCount}`,
      value: {
        expected: expectedTurnCount,
        actual: actualTurnCount,
        difference: actualTurnCount - expectedTurnCount,
      },
    };
  },
};
