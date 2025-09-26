import {
  ApplicationError,
  Result,
  err,
  isOk,
  ok,
  unwrap,
  unwrapErr,
} from "@the-project-b/types";
import {
  Dataset,
  EvaluationConfig,
  EvaluationContext,
  EvaluationRun,
  EvaluationService,
  EvaluatorDefinition,
  Experiment,
} from "../../domain/index.js";

export interface OrchestrationContext {
  experiment: Experiment;
  dataset: Dataset;
  config: EvaluationConfig;
  evaluators: EvaluatorDefinition[];
  graphName: string;
  splits?: string[];
  authContext: {
    token: string;
    userId: string;
    companyId: string;
  };
  onProgress?: (processed: number, total: number) => void;
}

export interface OrchestrationResult {
  experimentId: string;
  runs: EvaluationRun[];
  url: string;
  statistics: Record<string, any>;
}

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
      const runs: EvaluationRun[] = [];
      let processedCount = 0;

      // Get examples based on splits
      const examples = dataset.filterBySplits(context.splits || []);
      const totalExamples = examples.length * config.numRepetitions;

      // Process each example with repetitions
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

          // Execute evaluation for this example
          const result =
            await this.evaluationService.executeEvaluation(evaluationContext);

          if (isOk(result)) {
            const { run } = unwrap(result);
            runs.push(run);

            // Add run to experiment
            const addResult = experiment.addRun(run);
            if (!isOk(addResult)) {
              return err(new ApplicationError(unwrapErr(addResult).message));
            }
          } else {
            // Log error but continue with other examples
            console.error(
              `Failed to evaluate example ${example.id}: ${unwrapErr(result).message}`,
            );
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

      return ok({
        experimentId: experiment.id.toString(),
        runs,
        url,
        statistics,
      });
    } catch (error) {
      return err(
        new ApplicationError(
          `Orchestration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }
}
