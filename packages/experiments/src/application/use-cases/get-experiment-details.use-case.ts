import {
  ApplicationError,
  NotFoundError,
  Result,
  err,
  isOk,
  ok,
  unwrap,
  unwrapErr,
} from "@the-project-b/types";
import { ExperimentId, ExperimentRepository } from "../../domain/index.js";
import {
  ExperimentDetailsDto,
  RunResultDto,
} from "../dto/experiment-result.dto.js";

export interface GetExperimentDetailsDto {
  experimentId: string;
  limit?: number;
  offset?: number;
}

/**
 * Use case for getting experiment details
 */
export class GetExperimentDetailsUseCase {
  constructor(private readonly experimentRepo: ExperimentRepository) {}

  async execute(
    dto: GetExperimentDetailsDto,
  ): Promise<Result<ExperimentDetailsDto, ApplicationError | NotFoundError>> {
    try {
      const experimentId = new ExperimentId(dto.experimentId);

      // Get experiment
      const experimentResult = await this.experimentRepo.findById(experimentId);
      if (!isOk(experimentResult)) {
        return err(unwrapErr(experimentResult));
      }

      const experiment = unwrap(experimentResult);
      const stats = experiment.calculateStatistics();

      // Apply pagination to runs if needed
      let runs = [...experiment.runs];
      const totalRuns = runs.length;

      if (dto.offset) {
        runs = runs.slice(dto.offset);
      }
      if (dto.limit) {
        runs = runs.slice(0, dto.limit);
      }

      // Convert runs to DTOs
      const runDtos: RunResultDto[] = runs.map((run) => ({
        id: run.id,
        name: run.name,
        startTime: run.startTime,
        endTime: run.endTime,
        latency: run.getLatency(),
        inputs: run.inputs,
        outputs: run.outputs,
        inputsPreview: JSON.stringify(run.inputs).substring(0, 100),
        outputsPreview: run.outputs
          ? JSON.stringify(run.outputs).substring(0, 100)
          : undefined,
        error: run.error,
        totalTokens: run.metrics?.totalTokens,
        promptTokens: run.metrics?.promptTokens,
        completionTokens: run.metrics?.completionTokens,
        totalCost: run.metrics?.totalCost,
        promptCost: run.metrics?.promptCost,
        completionCost: run.metrics?.completionCost,
        feedbackStats: this.aggregateFeedback(run.feedbackScores),
        metadata: run.metadata,
        tags: run.tags,
      }));

      // Convert experiment to DTO
      const experimentDto = {
        id: experiment.id.toString(),
        name: experiment.name,
        datasetId: experiment.datasetId.toString(),
        startTime: experiment.startTime,
        endTime: experiment.endTime,
        description: experiment.description,
        runCount: experiment.runs.length,
        totalTokens: stats.totalTokens,
        totalCost: stats.totalCost,
        errorRate: stats.errorRate,
        feedbackStats: stats.feedbackStats,
        metadata: experiment.metadata,
        url: experiment.url,
      };

      return ok({
        experiment: experimentDto,
        runs: runDtos,
        totalRuns,
      });
    } catch (error) {
      return err(
        new ApplicationError(
          `Failed to get experiment details: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  private aggregateFeedback(scores: any[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const score of scores) {
      if (!result[score.key]) {
        result[score.key] = {
          scores: [],
          values: [],
        };
      }
      if (score.score !== undefined) {
        result[score.key].scores.push(score.score);
      }
      if (score.value !== undefined) {
        result[score.key].values.push(score.value);
      }
    }

    // Calculate averages
    for (const key in result) {
      const scores = result[key].scores;
      if (scores.length > 0) {
        result[key].avg =
          scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        result[key].count = scores.length;
      }
    }

    return result;
  }
}
