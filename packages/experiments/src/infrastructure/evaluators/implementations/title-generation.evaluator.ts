import {
  createLLMAsJudge,
  type EvaluatorResult as OpenEvalsResult,
} from "openevals";
import { createLogger } from "@the-project-b/logging";
import {
  TypedEvaluator,
  EvaluatorParams,
  EvaluationResult,
  EvaluationOptions,
  TextEvaluationInputs,
  TextEvaluationOutputs,
} from "../core/types.js";
import { getTitleGenerationPrompt } from "../prompts/title-generation.prompt.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "TitleGenerationEvaluator",
});

interface TitleGenerationInputs extends TextEvaluationInputs {
  readonly question: string;
  readonly preferredLanguage?: string;
}

interface TitleGenerationOutputs extends TextEvaluationOutputs {
  readonly answer: string;
  readonly threadTitle?: string;
  readonly threadId?: string;
}

interface TitleGenerationReferenceOutputs {
  readonly expectedLanguage?: string;
  readonly sensitivePatterns?: string[];
}

export const titleGenerationEvaluator: TypedEvaluator<
  "TITLE_GENERATION",
  TitleGenerationInputs,
  TitleGenerationOutputs,
  TitleGenerationReferenceOutputs
> = {
  config: {
    type: "TITLE_GENERATION",
    name: "Title Generation Quality",
    description:
      "Evaluates the quality of generated thread titles for professional wording, language consistency, and absence of sensitive data",
    defaultModel: "openai:gpt-4o",
    supportsCustomPrompt: true,
    supportsReferenceKey: true,
  } as const,

  async evaluate(
    params: EvaluatorParams<
      TitleGenerationInputs,
      TitleGenerationOutputs,
      TitleGenerationReferenceOutputs
    >,
    options: EvaluationOptions = {},
  ): Promise<EvaluationResult> {
    const { customPrompt, model, referenceKey } = options;

    const threadTitle = params.outputs?.threadTitle;
    if (!threadTitle || threadTitle.trim().length === 0) {
      logger.warn("[TITLE_GENERATION] No title generated for thread", {
        operation: "evaluate",
        evaluatorType: "TITLE_GENERATION",
        hasOutputs: !!params.outputs,
        hasThreadId: !!params.outputs?.threadId,
        hasAnswer: !!params.outputs?.answer,
        hasQuestion: !!params.inputs?.question,
      });
      return {
        key: "title_generation",
        score: 0,
        comment: "No title was generated for the thread",
      };
    }

    let referenceOutputs = undefined;
    if (params.referenceOutputs) {
      const key = referenceKey || "expectedLanguage";
      const referenceValue = params.referenceOutputs[key];

      if (referenceValue !== undefined) {
        referenceOutputs = {
          reference: referenceValue,
        };
        logger.debug(
          `[TITLE_GENERATION] Using reference key '${key}' with value: ${referenceValue}`,
          {
            operation: "evaluate",
            evaluatorType: "TITLE_GENERATION",
            referenceKey: key,
            hasReferenceOutputs: true,
          },
        );
      } else {
        logger.debug(
          `[TITLE_GENERATION] Reference key '${key}' not found, proceeding without reference`,
          {
            operation: "evaluate",
            evaluatorType: "TITLE_GENERATION",
            requestedKey: key,
            availableKeys: Object.keys(params.referenceOutputs),
          },
        );
      }
    }

    const preferredLanguage = params.inputs?.preferredLanguage || "EN";
    const dynamicPrompt = await getTitleGenerationPrompt(preferredLanguage);

    const evaluator = createLLMAsJudge({
      prompt: customPrompt || dynamicPrompt,
      model: model || this.config.defaultModel,
      feedbackKey: "title_generation",
      choices: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    });

    const evaluatorResult = (await evaluator({
      inputs: params.inputs,
      outputs: threadTitle,
      referenceOutputs,
    })) as OpenEvalsResult;

    const score = evaluatorResult.score as number;

    logger.info("[TITLE_GENERATION] Evaluation completed", {
      operation: "evaluate",
      evaluatorType: "TITLE_GENERATION",
      score,
      title: threadTitle,
      titleLength: threadTitle.length,
      hasComment: !!evaluatorResult.comment,
      inputLanguage: params.inputs?.preferredLanguage,
    });

    return {
      key: evaluatorResult.key,
      score,
      comment: evaluatorResult.comment,
    };
  },
} as const;