import {
  createLLMAsJudge,
  type EvaluatorResult as OpenEvalsResult,
} from "openevals";
import {
  TypedEvaluator,
  EvaluatorParams,
  EvaluationResult,
  EvaluationOptions,
  TextEvaluationInputs,
  TextEvaluationOutputs,
} from "../core/types.js";
import { LANGUAGE_VERIFICATION_PROMPT } from "../prompts/language-verification.prompt.js";

interface LanguageVerificationInputs extends TextEvaluationInputs {
  readonly question: string;
  readonly preferredLanguage?: string;
}

interface LanguageVerificationOutputs extends TextEvaluationOutputs {
  readonly answer: string;
  readonly preferredLanguage?: string;
}

interface LanguageVerificationReferenceOutputs {
  [key: string]: string;
}

export const languageVerificationEvaluator: TypedEvaluator<
  "LANGUAGE_VERIFICATION",
  LanguageVerificationInputs,
  LanguageVerificationOutputs,
  LanguageVerificationReferenceOutputs
> = {
  config: {
    type: "LANGUAGE_VERIFICATION",
    name: "Language Verification",
    description:
      "Verifies that the final response is written in the correct target language (EN/German vs DE/English)",
    defaultModel: "openai:gpt-4o",
    supportsCustomPrompt: true,
    supportsReferenceKey: true,
  } as const,

  async evaluate(
    params: EvaluatorParams<
      LanguageVerificationInputs,
      LanguageVerificationOutputs,
      LanguageVerificationReferenceOutputs
    >,
    options: EvaluationOptions = {},
  ): Promise<EvaluationResult> {
    const { customPrompt, model, referenceKey } = options;

    let expectedLanguage: string | undefined;
    if (
      referenceKey &&
      params.referenceOutputs &&
      params.referenceOutputs[referenceKey]
    ) {
      expectedLanguage = params.referenceOutputs[referenceKey];
    }

    if (!expectedLanguage && params.inputs.preferredLanguage) {
      expectedLanguage = params.inputs.preferredLanguage;
    }

    if (!expectedLanguage && params.outputs.preferredLanguage) {
      expectedLanguage = params.outputs.preferredLanguage;
    }

    if (!expectedLanguage) {
      expectedLanguage = "EN";
    }

    expectedLanguage = expectedLanguage.toUpperCase();
    if (expectedLanguage !== "EN" && expectedLanguage !== "DE") {
      if (expectedLanguage.toLowerCase().includes("english")) {
        expectedLanguage = "EN";
      } else if (
        expectedLanguage.toLowerCase().includes("german") ||
        expectedLanguage.toLowerCase().includes("deutsch")
      ) {
        expectedLanguage = "DE";
      }
    }

    const referenceOutputs = {
      reference: `Target Language: ${expectedLanguage} (${expectedLanguage === "EN" ? "English" : "German"})`,
    };

    const evaluator = createLLMAsJudge({
      prompt: customPrompt || LANGUAGE_VERIFICATION_PROMPT,
      model: model || this.config.defaultModel,
      feedbackKey: "language_verification",
    });

    const enhancedInputs = {
      ...params.inputs,
      languageContext: `Expected Language: ${expectedLanguage} (${expectedLanguage === "EN" ? "English" : "German"})`,
    };

    const evaluatorResult = (await evaluator({
      inputs: enhancedInputs,
      outputs: {
        answer: params.outputs.answer,
      },
      referenceOutputs,
    })) as OpenEvalsResult;

    let binaryScore = 0;
    if (typeof evaluatorResult.score === "number") {
      binaryScore = evaluatorResult.score >= 0.5 ? 1 : 0;
    } else if (typeof evaluatorResult.score === "boolean") {
      binaryScore = evaluatorResult.score ? 1 : 0;
    } else if (
      evaluatorResult.score === null ||
      evaluatorResult.score === undefined
    ) {
      binaryScore = 0;
    }

    const languageSource =
      referenceKey &&
      params.referenceOutputs &&
      params.referenceOutputs[referenceKey]
        ? "dataset_output"
        : params.inputs.preferredLanguage
          ? "dataset_input"
          : params.outputs.preferredLanguage
            ? "user_authentication"
            : "default";

    const enhancedComment =
      `${evaluatorResult.comment || ""} [Expected: ${expectedLanguage === "EN" ? "English" : "German"}, Source: ${languageSource}, Original Score: ${evaluatorResult.score}]`.trim();

    return {
      key: evaluatorResult.key,
      score: binaryScore,
      comment: enhancedComment,
    };
  },
} as const;
