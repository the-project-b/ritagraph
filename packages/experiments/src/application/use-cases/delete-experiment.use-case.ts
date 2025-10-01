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

export interface DeleteExperimentDto {
  experimentId: string;
  deleteRuns?: boolean;
}

export interface DeleteExperimentResult {
  success: boolean;
  message: string;
  deletedRuns?: number;
}

/**
 * Use case for deleting experiments
 */
export class DeleteExperimentUseCase {
  constructor(private readonly experimentRepo: ExperimentRepository) {}

  async execute(
    dto: DeleteExperimentDto,
  ): Promise<Result<DeleteExperimentResult, ApplicationError | NotFoundError>> {
    try {
      const experimentId = new ExperimentId(dto.experimentId);

      // Verify experiment exists
      const experimentResult = await this.experimentRepo.findById(experimentId);
      if (!isOk(experimentResult)) {
        return err(unwrapErr(experimentResult));
      }

      let deletedRuns = 0;

      // Delete runs if requested
      if (dto.deleteRuns) {
        const deleteRunsResult =
          await this.experimentRepo.deleteRuns(experimentId);
        if (isOk(deleteRunsResult)) {
          deletedRuns = unwrap(deleteRunsResult);
        }
      }

      // Delete experiment
      const deleteResult = await this.experimentRepo.delete(experimentId);
      if (!isOk(deleteResult)) {
        return err(new ApplicationError("Failed to delete experiment"));
      }

      return ok({
        success: true,
        message: `Experiment ${dto.experimentId} deleted successfully`,
        deletedRuns: dto.deleteRuns ? deletedRuns : undefined,
      });
    } catch (error) {
      return err(
        new ApplicationError(
          `Failed to delete experiment: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }
}
