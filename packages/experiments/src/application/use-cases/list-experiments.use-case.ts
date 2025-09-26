import {
  ApplicationError,
  Result,
  err,
  isOk,
  ok,
  unwrap,
} from "@the-project-b/types";
import {
  DatasetId,
  DatasetRepository,
  ExperimentFilter,
  ExperimentRepository,
} from "../../domain/index.js";
import { ExperimentResultDto } from "../dto/experiment-result.dto.js";

export interface ListExperimentsDto {
  datasetId?: string;
  datasetName?: string;
  status?: string;
  limit?: number;
  offset?: number;
  sortBy?: "startTime" | "endTime" | "name";
  sortOrder?: "asc" | "desc";
}

export interface ListExperimentsResult {
  experiments: ExperimentResultDto[];
  total: number;
}

/**
 * Use case for listing experiments
 */
export class ListExperimentsUseCase {
  constructor(
    private readonly experimentRepo: ExperimentRepository,
    private readonly datasetRepo: DatasetRepository,
  ) {}

  async execute(
    dto: ListExperimentsDto,
  ): Promise<Result<ListExperimentsResult, ApplicationError>> {
    try {
      let datasetId: DatasetId | undefined;

      // Resolve dataset ID if name is provided
      if (dto.datasetName) {
        const datasetResult = await this.datasetRepo.findByName(
          dto.datasetName,
        );
        if (!isOk(datasetResult)) {
          return err(
            new ApplicationError(`Dataset "${dto.datasetName}" not found`),
          );
        }
        datasetId = unwrap(datasetResult).id;
      } else if (dto.datasetId) {
        datasetId = new DatasetId(dto.datasetId);
      }

      // Build filter
      const filter: ExperimentFilter = {
        limit: dto.limit,
        offset: dto.offset,
        sortBy: dto.sortBy,
        sortOrder: dto.sortOrder,
      };

      if (dto.status) {
        filter.status = dto.status as any;
      }

      // List experiments
      const result = datasetId
        ? await this.experimentRepo.listByDataset(datasetId, filter)
        : await this.experimentRepo.listAll(filter);

      if (!isOk(result)) {
        return err(new ApplicationError("Failed to list experiments"));
      }

      const { experiments, total } = unwrap(result);

      // Convert to DTOs
      const experimentDtos: ExperimentResultDto[] = experiments.map((exp) => {
        const stats = exp.calculateStatistics();
        return {
          id: exp.id.toString(),
          name: exp.name,
          datasetId: exp.datasetId.toString(),
          startTime: exp.startTime,
          endTime: exp.endTime,
          description: exp.description,
          runCount: exp.runs.length,
          totalTokens: stats.totalTokens,
          totalCost: stats.totalCost,
          errorRate: stats.errorRate,
          feedbackStats: stats.feedbackStats,
          metadata: exp.metadata,
          url: exp.url,
        };
      });

      return ok({
        experiments: experimentDtos,
        total,
      });
    } catch (error) {
      return err(
        new ApplicationError(
          `Failed to list experiments: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }
}
