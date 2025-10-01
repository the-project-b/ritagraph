import {
  ApplicationError,
  Result,
  err,
  isOk,
  ok,
  unwrap,
  unwrapErr,
} from "@the-project-b/types";
import { createLogger } from "@the-project-b/logging";
import {
  Dataset,
  EvaluationConfig,
  EvaluationContext,
  EvaluationRun,
  EvaluationService,
  EvaluatorDefinition,
  Experiment,
} from "../../domain/index.js";
import { AuthContextDto } from "../dto/auth-context.dto.js";

export interface OrchestrationContext {
  experiment: Experiment;
  dataset: Dataset;
  config: EvaluationConfig;
  evaluators: EvaluatorDefinition[];
  graphName: string;
  splits?: string[];
  authContext: AuthContextDto;
  onProgress?: (processed: number, total: number) => void;
}

export interface OrchestrationResult {
  experimentId: string;
  runs: EvaluationRun[];
  url: string;
  statistics: Record<string, any>;
}

const logger = createLogger({ service: "experiments" }).child({
  module: "EvaluationOrchestratorService",
});

/**
 * Service to orchestrate evaluation execution
 */
export class EvaluationOrchestratorService {
  constructor(private readonly evaluationService: EvaluationService) {}

  async orchestrateEvaluation(
    context: OrchestrationContext,
  ): Promise<Result<OrchestrationResult, ApplicationError>> {
    try {
      const { experiment, dataset, config, evaluators, authContext } = context;

      logger.info("Starting evaluation", {
        datasetId: dataset.id.toString(),
        datasetName: dataset.name,
        splits: context.splits,
        evaluators: evaluators.length,
        numRepetitions: config.numRepetitions,
      });

      // For LangSmith, we need to pass the dataset name directly
      // LangSmith will handle fetching examples and iteration
      const evaluationService = this.evaluationService as any;

      if (evaluationService.executeDatasetEvaluation) {
        // Use the new dataset-based evaluation method
        const result = await evaluationService.executeDatasetEvaluation(
          dataset.name, // Pass dataset NAME, not ID
          config,
          evaluators,
          authContext,
          experiment,
          context.splits,
        );

        if (isOk(result)) {
          const evaluationResult = unwrap(result) as any;

          logger.info("Dataset evaluation completed", {
            experimentId: evaluationResult.experimentId,
            experimentName: evaluationResult.experimentName,
            resultCount: evaluationResult.results?.length || 0,
          });

          // LangSmith handles everything internally, we just need to return the results
          return ok({
            experimentId:
              evaluationResult.experimentId || experiment.id.toString(),
            runs: [], // LangSmith doesn't return individual runs in the same format
            url:
              evaluationResult.url ||
              this.evaluationService.calculateExperimentUrl(
                experiment.id.toString(),
              ),
            statistics: {
              totalRuns: evaluationResult.results?.length || 0,
            },
          });
        } else {
          return err(
            new ApplicationError(
              `Dataset evaluation failed: ${(unwrapErr(result) as any).message || "Unknown error"}`,
            ),
          );
        }
      } else {
        // Fallback to the old example-by-example approach (shouldn't happen with LangSmith)
        logger.warn("Falling back to example-by-example evaluation");

        const runs: EvaluationRun[] = [];
        let processedCount = 0;

        // Get examples based on splits
        const examples = dataset.filterBySplits(context.splits || []);
        const totalExamples = examples.length * config.numRepetitions;

        for (const example of examples) {
          for (let rep = 0; rep < config.numRepetitions; rep++) {
            const evaluationContext: EvaluationContext = {
              experiment,
              dataset,
              example,
              config,
              evaluators,
              authContext,
            };

            const result =
              await this.evaluationService.executeEvaluation(evaluationContext);

            if (isOk(result)) {
              const { run } = unwrap(result);
              runs.push(run);
              experiment.addRun(run);
            } else {
              logger.error("Failed to evaluate example", {
                exampleId: example.id,
                error: unwrapErr(result).message,
              });
            }

            processedCount++;
            if (context.onProgress) {
              context.onProgress(processedCount, totalExamples);
            }
          }
        }

        // Calculate statistics
        const statistics = experiment.calculateStatistics();

        // Generate URL
        const url = this.evaluationService.calculateExperimentUrl(
          experiment.id.toString(),
        );

        logger.info("Completed evaluation", {
          experimentId: experiment.id.toString(),
          runsExecuted: runs.length,
          statistics,
        });

        return ok({
          experimentId: experiment.id.toString(),
          runs,
          url,
          statistics,
        });
      }
    } catch (error) {
      return err(
        new ApplicationError(
          `Orchestration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }
}
