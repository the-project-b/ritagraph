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
import { createLogger } from "@the-project-b/logging";
import {
  Dataset,
  DatasetId,
  DatasetRepository,
  Example,
  ExampleFilter,
} from "../../../domain/index.js";
import { LangSmithAdapter } from "../../adapters/langsmith.adapter.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "LangSmithDatasetRepository",
});

/**
 * LangSmith implementation of DatasetRepository
 */
export class LangSmithDatasetRepository implements DatasetRepository {
  constructor(private adapter: LangSmithAdapter) {}

  async findById(id: DatasetId): Promise<Result<Dataset, NotFoundError>> {
    // Since we use the dataset name as the ID for LangSmith,
    // findById actually uses the name to query
    return this.findByName(id.toString());
  }

  async findByName(name: string): Promise<Result<Dataset, NotFoundError>> {
    try {
      const providerDataset = await this.adapter.getDataset(name);

      if (!providerDataset) {
        return err(new NotFoundError("Dataset", name));
      }

      // Load examples into the dataset
      const examples: Example[] = [];
      const exampleIterator = this.listExamples(new DatasetId(name));

      for await (const example of exampleIterator) {
        examples.push(example);
      }

      const dataset = this.toDomainEntity(providerDataset, examples);
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
    // Since we use dataset name as the ID, just use it directly
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
        splits: providerExample.splits,
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
    // LangSmith API requires the dataset name, not UUID
    // The DatasetId value IS the dataset name in our current implementation
    // because the use case gets the dataset by name and passes dataset.id
    // Since we store the UUID as ID but LangSmith needs the name,
    // we need to use the DatasetId's value which should be the name
    // TODO: This is a temporary solution - ideally we'd store name in Dataset entity
    const datasetName = datasetId.toString();
    logger.debug('countExamples called', {
      datasetId: datasetName,
      splits
    });
    const count = await this.adapter.countExamples(datasetName, splits);
    logger.debug('countExamples result', { count });
    return count;
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

  private toDomainEntity(providerDataset: any, examples: Example[] = []): Dataset {
    const result = Dataset.create({
      // For LangSmith, we use the name as the ID since that's what we need for queries
      // The UUID is stored in metadata if needed
      id: providerDataset.name,
      name: providerDataset.name,
      description: providerDataset.description,
      examples: examples,
      metadata: {
        ...providerDataset.metadata,
        langsmithId: providerDataset.id, // Store the UUID here
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
