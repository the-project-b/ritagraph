import type { EvaluatorResult as OpenEvalsResult } from "openevals";
import { createLogger } from "@the-project-b/logging";
import {
  TypedEvaluator,
  EvaluatorParams,
  EvaluationResult,
  EvaluationOptions,
  TextEvaluationInputs,
  TextEvaluationOutputs,
} from "../core/types.js";
import { EXPECTED_OUTPUT_PROMPT } from "../prompts/expected-output.prompt.js";

// Create logger instance
const logger = createLogger({ service: "experiments" }).child({
  module: "ExpectedOutputEvaluator",
});

// Define the specific types for this evaluator
interface ExpectedOutputInputs extends TextEvaluationInputs {
  readonly question: string;
}

interface ExpectedOutputOutputs extends TextEvaluationOutputs {
  readonly answer: string;
}

interface ExpectedOutputReferenceOutputs {
  readonly reference: string;
}

export const expectedOutputEvaluator: TypedEvaluator<
  "EXPECTED_OUTPUT",
  ExpectedOutputInputs,
  ExpectedOutputOutputs,
  ExpectedOutputReferenceOutputs
> = {
  config: {
    type: "EXPECTED_OUTPUT",
    name: "Expected Output",
    description:
      "Evaluates if the agent output matches the expected output described in the dataset",
    defaultModel: "openai:gpt-4o",
    supportsCustomPrompt: true,
    supportsReferenceKey: true,
  } as const,

  async evaluate(
    params: EvaluatorParams<
      ExpectedOutputInputs,
      ExpectedOutputOutputs,
      ExpectedOutputReferenceOutputs
    >,
    options: EvaluationOptions = {},
  ): Promise<EvaluationResult> {
    const { customPrompt, model, referenceKey } = options;

    // Build reference outputs with proper typing and validation
    let referenceOutputs = undefined;
    if (params.referenceOutputs) {
      const key = referenceKey || "reference";
      const referenceValue = params.referenceOutputs[key];

      if (referenceValue === undefined) {
        logger.warn(
          `[EXPECTED_OUTPUT] Reference key '${key}' not found in referenceOutputs. Available keys: ${Object.keys(params.referenceOutputs).join(", ")}`,
          {
            operation: "evaluate",
            evaluatorType: "EXPECTED_OUTPUT",
            requestedKey: key,
            availableKeys: Object.keys(params.referenceOutputs),
            isCustomKey: referenceKey !== undefined,
            hasQuestion: !!params.inputs?.question,
            hasAnswer: !!params.outputs?.answer,
          },
        );
        // Try to find a reasonable fallback
        const availableKeys = Object.keys(params.referenceOutputs);
        const fallbackKey =
          availableKeys.find(
            (k) => k.includes("expected") || k.includes("reference"),
          ) || availableKeys[0];
        if (fallbackKey) {
          logger.warn(`[EXPECTED_OUTPUT] Using fallback key '${fallbackKey}'`, {
            operation: "evaluate",
            evaluatorType: "EXPECTED_OUTPUT",
            originalKey: key,
            fallbackKey,
            availableKeys,
            foundExpectedKey: availableKeys.some((k) => k.includes("expected")),
            foundReferenceKey: availableKeys.some((k) =>
              k.includes("reference"),
            ),
          });
          referenceOutputs = {
            reference: params.referenceOutputs[fallbackKey],
          };
        }
      } else {
        referenceOutputs = {
          reference: referenceValue,
        };
      }
    }

    // Import and use the regular createLLMAsJudge
    const { createLLMAsJudge } = await import("openevals");

    // Create the LLM judge with industry-standard 0-1 scale scoring
    const evaluator = createLLMAsJudge({
      prompt: customPrompt || EXPECTED_OUTPUT_PROMPT,
      model: model || this.config.defaultModel,
      feedbackKey: "expected_output",
      choices: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], // 0-1 scale in 0.1 increments
    });

    // Execute evaluation directly with params.inputs (expecting 'question' key)
    const evaluatorResult = (await evaluator({
      inputs: params.inputs,
      outputs: params.outputs,
      referenceOutputs,
    })) as OpenEvalsResult;

    // Ensure score is a valid number
    const score =
      typeof evaluatorResult.score === "number"
        ? evaluatorResult.score
        : typeof evaluatorResult.score === "boolean"
          ? evaluatorResult.score
            ? 1
            : 0
          : 0;

    return {
      key: evaluatorResult.key,
      score,
      comment: evaluatorResult.comment,
    };
  },
} as const;
