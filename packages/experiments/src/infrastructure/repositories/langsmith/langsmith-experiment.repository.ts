import {
  NotFoundError,
  PersistenceError,
  Result,
  err,
  isOk,
  ok,
  unwrap,
  unwrapErr,
} from "@the-project-b/types";
import {
  DatasetId,
  EvaluationConfig,
  Experiment,
  ExperimentFilter,
  ExperimentId,
  ExperimentListResult,
  ExperimentRepository,
  ExperimentStatus,
} from "../../../domain/index.js";
import { LangSmithAdapter } from "../../adapters/langsmith.adapter.js";

/**
 * LangSmith implementation of ExperimentRepository
 */
export class LangSmithExperimentRepository implements ExperimentRepository {
  constructor(private adapter: LangSmithAdapter) {}

  async findById(id: ExperimentId): Promise<Result<Experiment, NotFoundError>> {
    try {
      const providerExperiment = await this.adapter.getExperiment(
        id.toString(),
      );

      if (!providerExperiment) {
        return err(new NotFoundError("Experiment", id.toString()));
      }

      const experiment = this.toDomainEntity(providerExperiment);
      return ok(experiment);
    } catch (error) {
      return err(
        new NotFoundError("Experiment", id.toString(), {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  async listByDataset(
    datasetId: DatasetId,
    filter?: ExperimentFilter,
  ): Promise<Result<ExperimentListResult, PersistenceError>> {
    try {
      const { experiments, total } = await this.adapter.listExperiments(
        datasetId.toString(),
        filter?.limit,
        filter?.offset,
      );

      const domainExperiments = experiments.map((exp) =>
        this.toDomainEntity(exp),
      );

      return ok({
        experiments: domainExperiments,
        total,
      });
    } catch (error) {
      return err(
        new PersistenceError(
          `Failed to list experiments: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  async listAll(
    filter?: ExperimentFilter,
  ): Promise<Result<ExperimentListResult, PersistenceError>> {
    try {
      const { experiments, total } = await this.adapter.listExperiments(
        undefined,
        filter?.limit,
        filter?.offset,
      );

      const domainExperiments = experiments.map((exp) =>
        this.toDomainEntity(exp),
      );

      return ok({
        experiments: domainExperiments,
        total,
      });
    } catch (error) {
      return err(
        new PersistenceError(
          `Failed to list experiments: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  async save(experiment: Experiment): Promise<Result<void, PersistenceError>> {
    try {
      // LangSmith creates experiments implicitly during evaluation
      // We store metadata but don't actually create the experiment yet
      await this.adapter.createExperiment({
        name: experiment.name,
        datasetId: experiment.datasetId.toString(),
        metadata: {
          ...experiment.metadata,
          status: experiment.status,
          config: experiment.config,
        },
      });

      return ok(undefined);
    } catch (error) {
      return err(
        new PersistenceError(
          `Failed to save experiment: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  async update(
    experiment: Experiment,
  ): Promise<Result<void, PersistenceError>> {
    // LangSmith doesn't support updating experiments directly
    // We'd need to implement this via metadata updates or similar
    return ok(undefined);
  }

  async delete(id: ExperimentId): Promise<Result<void, PersistenceError>> {
    try {
      const success = await this.adapter.deleteExperiment(id.toString());

      if (!success) {
        return err(
          new PersistenceError(
            "LangSmith does not support deleting experiments",
          ),
        );
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new PersistenceError(
          `Failed to delete experiment: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  async deleteRuns(
    id: ExperimentId,
  ): Promise<Result<number, PersistenceError>> {
    // LangSmith doesn't support bulk deletion of runs
    return err(
      new PersistenceError("LangSmith does not support deleting runs in bulk"),
    );
  }

  private toDomainEntity(providerExperiment: any): Experiment {
    // Create a minimal config for the experiment
    const config = new EvaluationConfig({
      selectedCompanyId: providerExperiment.metadata?.companyId || "unknown",
      maxConcurrency: providerExperiment.metadata?.maxConcurrency,
      numRepetitions: providerExperiment.metadata?.numRepetitions,
    });

    const result = Experiment.create({
      id: providerExperiment.id,
      name: providerExperiment.name,
      datasetId: providerExperiment.datasetId,
      config,
      status: this.mapStatus(providerExperiment),
      description: providerExperiment.description,
      startTime: providerExperiment.startTime,
      endTime: providerExperiment.endTime,
      metadata: providerExperiment.metadata,
      url: this.adapter.getExperimentUrl(providerExperiment.id),
    });

    if (!isOk(result)) {
      throw new Error(
        `Failed to create Experiment entity: ${unwrapErr(result).message}`,
      );
    }

    return unwrap(result);
  }

  private mapStatus(providerExperiment: any): ExperimentStatus {
    if (providerExperiment.metadata?.status) {
      return providerExperiment.metadata.status as ExperimentStatus;
    }

    if (providerExperiment.endTime) {
      return ExperimentStatus.COMPLETED;
    }

    return ExperimentStatus.RUNNING;
  }
}
