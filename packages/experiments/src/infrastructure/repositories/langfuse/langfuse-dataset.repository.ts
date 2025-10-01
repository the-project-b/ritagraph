import {
  err,
  NotFoundError,
  PersistenceError,
  Result,
} from "@the-project-b/types";
import {
  Dataset,
  DatasetId,
  DatasetRepository,
  Example,
  ExampleFilter,
} from "../../../domain/index.js";
import { LangFuseAdapter } from "../../adapters/langfuse.adapter.js";

/**
 * LangFuse implementation of DatasetRepository (SCAFFOLDING ONLY)
 * TODO: Implement actual LangFuse integration
 */
export class LangFuseDatasetRepository implements DatasetRepository {
  constructor(private adapter: LangFuseAdapter) {}

  async findById(id: DatasetId): Promise<Result<Dataset, NotFoundError>> {
    // TODO: Implement LangFuse dataset lookup by ID
    return err(
      new NotFoundError("Dataset", id.toString(), {
        error: "LangFuse provider not yet implemented",
      }),
    );
  }

  async findByName(name: string): Promise<Result<Dataset, NotFoundError>> {
    // TODO: Implement LangFuse dataset lookup by name
    try {
      const providerDataset = await this.adapter.getDataset(name);

      if (!providerDataset) {
        return err(new NotFoundError("Dataset", name));
      }

      // TODO: Transform LangFuse dataset to domain entity
      throw new Error("LangFuse provider not yet implemented");
    } catch (error) {
      return err(
        new NotFoundError("Dataset", name, {
          error: "LangFuse provider not yet implemented",
        }),
      );
    }
  }

  // eslint-disable-next-line require-yield
  async *listExamples(
    datasetId: DatasetId,
    filter?: ExampleFilter,
  ): AsyncIterable<Example> {
    // TODO: Implement LangFuse example listing
    // Need to handle LangFuse's dataset items
    // For now, return empty iterator
    return;
    // throw new Error("LangFuse provider not yet implemented");
  }

  async countExamples(
    datasetId: DatasetId,
    splits?: string[],
  ): Promise<number> {
    // TODO: Implement LangFuse example counting
    throw new Error("LangFuse provider not yet implemented");
  }

  async exists(name: string): Promise<boolean> {
    // TODO: Check if dataset exists in LangFuse
    try {
      const dataset = await this.adapter.getDataset(name);
      return dataset !== null;
    } catch {
      return false;
    }
  }

  async save(dataset: Dataset): Promise<Result<void, PersistenceError>> {
    // TODO: Implement LangFuse dataset creation
    // Check if LangFuse API supports creating datasets programmatically
    return err(
      new PersistenceError(
        "Creating datasets is not yet implemented for LangFuse",
      ),
    );
  }

  async delete(id: DatasetId): Promise<Result<void, PersistenceError>> {
    // TODO: Implement LangFuse dataset deletion
    // Check if LangFuse API supports deleting datasets
    return err(
      new PersistenceError(
        "Deleting datasets is not yet implemented for LangFuse",
      ),
    );
  }
}
