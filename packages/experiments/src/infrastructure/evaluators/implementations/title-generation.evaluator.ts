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
import { promptService } from "../../services/prompt.service.js";
import { PromptTemplate } from "@langchain/core/prompts";

const logger = createLogger({ service: "experiments" }).child({
  module: "TitleGenerationEvaluator",
});

interface LanguageConfig {
  id: string;
  languageText: string;
  goodExamples: string[];
  badExamples: string[];
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  DE: {
    id: "DE",
    languageText: "German",
    goodExamples: [
      '"Gehaltsanpassung für Thompson" (German, professional, no sensitive data)',
      '"Mitarbeiterübersicht" (German, clear, no specifics)',
      '"Leistungsbonus Aktualisierung Garcia" (German, professional, name is OK)',
      '"Überstundensatz Änderung Wilson" (German, professional, no sensitive data)',
      '"Gehaltsanpassungen für mehrere Mitarbeiter" (German, professional, no sensitive data)',
    ],
    badExamples: [
      '"Erhöhe Thompson Gehalt auf €4000" (exposes specific amount)',
      '"15% Bonus für Garcia" (exposes specific percentage)',
      '"Salary Anpassung für Mitarbeiter" (mixed language)',
      '"irgendwas mit Geld" (unprofessional)',
    ],
  },
  EN: {
    id: "EN",
    languageText: "English",
    goodExamples: [
      '"Salary adjustment for Thompson" (English, professional, no sensitive data)',
      '"Employee list overview" (English, clear, no specifics)',
      '"Performance bonus update for Garcia" (English, professional, name is OK)',
      '"Overtime rate modification for Wilson" (English, professional, no sensitive data)',
      '"Salary adjustments for multiple employees" (English, professional, no sensitive data)',
    ],
    badExamples: [
      '"Increase Thompson salary to €4000" (exposes specific amount)',
      '"15% bonus for Garcia" (exposes specific percentage)',
      '"Gehalt adjustment for employee" (mixed language)',
      '"stuff about money" (unprofessional)',
    ],
  },
};

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

    // Fetch prompt from LangFuse if no custom prompt is provided
    let dynamicPrompt = customPrompt;
    if (!dynamicPrompt) {
      const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
        promptName: "experiments-evaluator-title-generation",
      });

      // Get language config for formatting
      const languageCode = preferredLanguage || "EN";
      const config = LANGUAGE_CONFIGS[languageCode] || LANGUAGE_CONFIGS.EN;

      // Format the template with language-specific variables
      const promptTemplate = PromptTemplate.fromTemplate(rawPrompt.template);
      dynamicPrompt = await promptTemplate.format({
        languageText: config.languageText,
        goodExamples: config.goodExamples.map((ex) => `  - ${ex}`).join("\n"),
        badExamples: config.badExamples.map((ex) => `  - ${ex}`).join("\n"),
        inputs: "{inputs}",
        outputs: "{outputs}",
        reference_outputs: "{reference_outputs}",
      });
    }

    const evaluator = createLLMAsJudge({
      prompt: dynamicPrompt,
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