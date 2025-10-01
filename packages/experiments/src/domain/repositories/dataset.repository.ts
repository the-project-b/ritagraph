import { NotFoundError, PersistenceError, Result } from "@the-project-b/types";
import { Dataset } from "../entities/dataset.entity.js";
import { Example } from "../entities/example.entity.js";
import { DatasetId } from "../value-objects/dataset-id.value-object.js";

export interface ExampleFilter {
  splits?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Repository interface for Dataset operations
 */
export interface DatasetRepository {
  /**
   * Find a dataset by its ID
   */
  findById(id: DatasetId): Promise<Result<Dataset, NotFoundError>>;

  /**
   * Find a dataset by its name
   */
  findByName(name: string): Promise<Result<Dataset, NotFoundError>>;

  /**
   * List examples from a dataset as an async iterable
   */
  listExamples(
    datasetId: DatasetId,
    filter?: ExampleFilter,
  ): AsyncIterable<Example>;

  /**
   * Count examples in a dataset
   */
  countExamples(datasetId: DatasetId, splits?: string[]): Promise<number>;

  /**
   * Check if a dataset exists by name
   */
  exists(name: string): Promise<boolean>;

  /**
   * Save a dataset
   */
  save(dataset: Dataset): Promise<Result<void, PersistenceError>>;

  /**
   * Delete a dataset
   */
  delete(id: DatasetId): Promise<Result<void, PersistenceError>>;
}
