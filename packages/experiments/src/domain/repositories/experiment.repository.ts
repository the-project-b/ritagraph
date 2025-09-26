import { NotFoundError, PersistenceError, Result } from "@the-project-b/types";
import { Experiment, ExperimentStatus } from "../entities/experiment.entity.js";
import { DatasetId } from "../value-objects/dataset-id.value-object.js";
import { ExperimentId } from "../value-objects/experiment-id.value-object.js";

export interface ExperimentFilter {
  status?: ExperimentStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: "startTime" | "endTime" | "name";
  sortOrder?: "asc" | "desc";
}

export interface ExperimentListResult {
  experiments: Experiment[];
  total: number;
}

/**
 * Repository interface for Experiment operations
 */
export interface ExperimentRepository {
  /**
   * Find an experiment by its ID
   */
  findById(id: ExperimentId): Promise<Result<Experiment, NotFoundError>>;

  /**
   * List experiments for a dataset
   */
  listByDataset(
    datasetId: DatasetId,
    filter?: ExperimentFilter,
  ): Promise<Result<ExperimentListResult, PersistenceError>>;

  /**
   * List all experiments
   */
  listAll(
    filter?: ExperimentFilter,
  ): Promise<Result<ExperimentListResult, PersistenceError>>;

  /**
   * Save an experiment
   */
  save(experiment: Experiment): Promise<Result<void, PersistenceError>>;

  /**
   * Update an experiment
   */
  update(experiment: Experiment): Promise<Result<void, PersistenceError>>;

  /**
   * Delete an experiment
   */
  delete(id: ExperimentId): Promise<Result<void, PersistenceError>>;

  /**
   * Delete runs associated with an experiment
   */
  deleteRuns(id: ExperimentId): Promise<Result<number, PersistenceError>>;
}
