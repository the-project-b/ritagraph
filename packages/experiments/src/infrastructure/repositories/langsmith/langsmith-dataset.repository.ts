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
  Dataset,
  DatasetId,
  DatasetRepository,
  Example,
  ExampleFilter,
} from "../../../domain/index.js";
import { LangSmithAdapter } from "../../adapters/langsmith.adapter.js";

/**
 * LangSmith implementation of DatasetRepository
 */
export class LangSmithDatasetRepository implements DatasetRepository {
  constructor(private adapter: LangSmithAdapter) {}

  async findById(id: DatasetId): Promise<Result<Dataset, NotFoundError>> {
    // LangSmith doesn't support lookup by ID, only by name
    // This is a limitation we'll have to work around
    return err(new NotFoundError("Dataset", id.toString()));
  }

  async findByName(name: string): Promise<Result<Dataset, NotFoundError>> {
    try {
      const providerDataset = await this.adapter.getDataset(name);

      if (!providerDataset) {
        return err(new NotFoundError("Dataset", name));
      }

      const dataset = this.toDomainEntity(providerDataset);
      return ok(dataset);
    } catch (error) {
      return err(
        new NotFoundError("Dataset", name, {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  async *listExamples(
    datasetId: DatasetId,
    filter?: ExampleFilter,
  ): AsyncIterable<Example> {
    // We need the dataset name, not the ID
    // This is a limitation of LangSmith API
    // In practice, we often use the name as the ID
    const datasetName = datasetId.toString();

    const providerExamples = this.adapter.listExamples(datasetName, {
      splits: filter?.splits,
      limit: filter?.limit,
      offset: filter?.offset,
    });

    for await (const providerExample of providerExamples) {
      const exampleResult = Example.create({
        id: providerExample.id,
        inputs: providerExample.inputs,
        outputs: providerExample.outputs,
        metadata: providerExample.metadata,
        split: providerExample.split,
        datasetId: providerExample.datasetId,
        createdAt: providerExample.createdAt,
      });

      if (isOk(exampleResult)) {
        yield unwrap(exampleResult);
      }
    }
  }

  async countExamples(
    datasetId: DatasetId,
    splits?: string[],
  ): Promise<number> {
    const datasetName = datasetId.toString();
    return this.adapter.countExamples(datasetName, splits);
  }

  async exists(name: string): Promise<boolean> {
    const dataset = await this.adapter.getDataset(name);
    return dataset !== null;
  }

  async save(dataset: Dataset): Promise<Result<void, PersistenceError>> {
    // LangSmith doesn't support creating datasets through the client library
    // This would need to be implemented via direct API calls
    return err(
      new PersistenceError(
        "Creating datasets is not supported through LangSmith adapter",
      ),
    );
  }

  async delete(id: DatasetId): Promise<Result<void, PersistenceError>> {
    // LangSmith doesn't support deleting datasets through the client library
    return err(
      new PersistenceError(
        "Deleting datasets is not supported through LangSmith adapter",
      ),
    );
  }

  private toDomainEntity(providerDataset: any): Dataset {
    const result = Dataset.create({
      id: providerDataset.id || providerDataset.name,
      name: providerDataset.name,
      description: providerDataset.description,
      metadata: {
        ...providerDataset.metadata,
        createdAt: providerDataset.createdAt,
        updatedAt: providerDataset.updatedAt,
      },
    });

    if (!isOk(result)) {
      throw new Error(
        `Failed to create Dataset entity: ${unwrapErr(result).message}`,
      );
    }

    return unwrap(result);
  }
}
