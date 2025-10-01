import {
  err,
  NotFoundError,
  ok,
  PersistenceError,
  Result,
} from "@the-project-b/types";
import {
  DatasetId,
  Experiment,
  ExperimentFilter,
  ExperimentId,
  ExperimentListResult,
  ExperimentRepository,
} from "../../../domain/index.js";
import { LangFuseAdapter } from "../../adapters/langfuse.adapter.js";

/**
 * LangFuse implementation of ExperimentRepository (SCAFFOLDING ONLY)
 * TODO: Implement actual LangFuse integration
 */
export class LangFuseExperimentRepository implements ExperimentRepository {
  constructor(private adapter: LangFuseAdapter) {}

  async findById(id: ExperimentId): Promise<Result<Experiment, NotFoundError>> {
    // TODO: Implement LangFuse experiment/trace lookup
    // LangFuse uses traces instead of experiments
    return err(
      new NotFoundError("Experiment", id.toString(), {
        error: "LangFuse provider not yet implemented",
      }),
    );
  }

  async listByDataset(
    datasetId: DatasetId,
    filter?: ExperimentFilter,
  ): Promise<Result<ExperimentListResult, PersistenceError>> {
    // TODO: Implement LangFuse trace listing filtered by dataset
    // Need to query traces that are linked to dataset items
    return err(
      new PersistenceError("LangFuse experiment listing not yet implemented"),
    );
  }

  async listAll(
    filter?: ExperimentFilter,
  ): Promise<Result<ExperimentListResult, PersistenceError>> {
    // TODO: Implement LangFuse trace listing
    try {
      const { experiments, total } = await this.adapter.listExperiments(
        undefined,
        filter?.limit,
        filter?.offset,
      );

      // TODO: Transform LangFuse traces to domain experiments
      throw new Error("LangFuse provider not yet implemented");
    } catch (error) {
      return err(
        new PersistenceError("LangFuse experiment listing not yet implemented"),
      );
    }
  }

  async save(experiment: Experiment): Promise<Result<void, PersistenceError>> {
    // TODO: Implement LangFuse trace/session creation
    // LangFuse creates traces on-the-fly during evaluation
    return ok(undefined); // No-op for now as traces are created during evaluation
  }

  async update(
    experiment: Experiment,
  ): Promise<Result<void, PersistenceError>> {
    // TODO: Check if LangFuse supports updating traces
    // May need to update metadata or scores
    return ok(undefined); // No-op for now
  }

  async delete(id: ExperimentId): Promise<Result<void, PersistenceError>> {
    // TODO: Check if LangFuse supports deleting traces
    try {
      const success = await this.adapter.deleteExperiment(id.toString());

      if (!success) {
        return err(
          new PersistenceError(
            "LangFuse does not support deleting experiments",
          ),
        );
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new PersistenceError(
          "LangFuse experiment deletion not yet implemented",
        ),
      );
    }
  }

  async deleteRuns(
    id: ExperimentId,
  ): Promise<Result<number, PersistenceError>> {
    // TODO: Check if LangFuse supports bulk deletion of observations
    return err(
      new PersistenceError("LangFuse does not support deleting runs in bulk"),
    );
  }
}
