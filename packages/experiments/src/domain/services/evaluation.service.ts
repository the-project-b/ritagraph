import { Result, ValidationError, err, ok } from "@the-project-b/types";
import { Dataset } from "../entities/dataset.entity.js";
import { EvaluationRun } from "../entities/evaluation-run.entity.js";
import { Example } from "../entities/example.entity.js";
import { Experiment } from "../entities/experiment.entity.js";
import { EvaluationConfig } from "../value-objects/evaluation-config.value-object.js";

export interface EvaluatorDefinition {
  type: string;
  customPrompt?: string;
  langsmithPromptName?: string;
  model?: string;
  referenceKey?: string;
}

export interface EvaluationContext {
  experiment: Experiment;
  dataset: Dataset;
  example: Example;
  config: EvaluationConfig;
  evaluators: EvaluatorDefinition[];
  authContext: {
    token: string;
    userId: string;
    companyId: string;
  };
}

export interface EvaluationResult {
  run: EvaluationRun;
  feedbackScores: Array<{
    key: string;
    score?: number;
    value?: any;
    comment?: string;
  }>;
}

/**
 * Domain service for evaluation operations
 */
export abstract class EvaluationService {
  /**
   * Validate that an evaluation can be performed
   */
  validateEvaluation(
    dataset: Dataset,
    config: EvaluationConfig,
    evaluators: EvaluatorDefinition[],
  ): Result<void, ValidationError> {
    // Validate dataset has examples
    if (dataset.isEmpty()) {
      return err(
        new ValidationError("Dataset must contain at least one example"),
      );
    }

    // Validate config
    try {
      config.validate();
    } catch (error) {
      return err(error as ValidationError);
    }

    // Validate evaluators
    if (evaluators.length === 0) {
      return err(
        new ValidationError("At least one evaluator must be specified"),
      );
    }

    for (const evaluator of evaluators) {
      if (!evaluator.type) {
        return err(new ValidationError("Evaluator type is required"));
      }
    }

    return ok(undefined);
  }

  /**
   * Create an experiment name
   */
  createExperimentName(
    datasetName: string,
    prefix?: string,
    timestamp: Date = new Date(),
  ): string {
    const dateStr = timestamp.toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const basePrefix = prefix || datasetName;
    return `${basePrefix}-${dateStr}`;
  }

  /**
   * Calculate experiment URL (provider-specific)
   */
  abstract calculateExperimentUrl(
    experimentId: string,
    projectName?: string,
  ): string;

  /**
   * Execute evaluation for a single example (provider-specific)
   */
  abstract executeEvaluation(
    context: EvaluationContext,
  ): Promise<Result<EvaluationResult, Error>>;

  /**
   * Execute batch evaluation (provider-specific)
   */
  abstract executeBatchEvaluation(
    contexts: EvaluationContext[],
  ): AsyncIterable<Result<EvaluationResult, Error>>;
}
