import type {
  EvaluationOptions,
  EvaluationResult,
  Evaluator,
  EvaluatorConfig,
  EvaluatorParams,
} from "../core/types.js";

/**
 * Evaluator that compares output to expected reference output
 */
export class ExpectedOutputEvaluator implements Evaluator {
  readonly config: EvaluatorConfig = {
    type: "EXPECTED_OUTPUT",
    name: "Expected Output Evaluator",
    description: "Compares the output to an expected reference output",
    defaultModel: "gpt-4o-mini",
    supportsCustomPrompt: true,
    supportsReferenceKey: true,
    requiredReferenceKeys: ["expected_output"],
  };

  async evaluate(
    params: EvaluatorParams,
    options?: EvaluationOptions,
  ): Promise<EvaluationResult> {
    const { outputs, referenceOutputs } = params;
    const referenceKey = options?.referenceKey || "expected_output";

    // Check if reference output exists
    if (!referenceOutputs || !referenceOutputs[referenceKey]) {
      return {
        score: 0,
        comment: `No reference output found for key: ${referenceKey}`,
      };
    }

    const expected = referenceOutputs[referenceKey];
    const actual = outputs;

    // Simple equality check for now
    // In a real implementation, this would use LLM for semantic comparison
    const isEqual = JSON.stringify(actual) === JSON.stringify(expected);

    return {
      score: isEqual ? 1 : 0,
      value: isEqual,
      comment: isEqual
        ? "Output matches expected output"
        : "Output does not match expected output",
      extra: {
        expected,
        actual,
      },
    };
  }
}
