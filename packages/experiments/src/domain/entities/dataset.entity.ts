import { Result, ValidationError, err, ok } from "@the-project-b/types";
import { DatasetId } from "../value-objects/dataset-id.value-object.js";
import { Split } from "../value-objects/split.value-object.js";
import { Example } from "./example.entity.js";

export interface DatasetMetadata {
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  exampleCount?: number;
  [key: string]: any;
}

/**
 * Dataset entity - represents a collection of examples
 */
export class Dataset {
  private constructor(
    public readonly id: DatasetId,
    public readonly name: string,
    public readonly description?: string,
    private _examples: Example[] = [],
    private _splits: Split[] = [],
    public readonly metadata?: DatasetMetadata,
  ) {}

  static create(props: {
    id: string | DatasetId;
    name: string;
    description?: string;
    examples?: Example[];
    splits?: string[] | Split[];
    metadata?: DatasetMetadata;
  }): Result<Dataset, ValidationError> {
    if (!props.name) {
      return err(new ValidationError("Dataset name is required"));
    }

    const id =
      typeof props.id === "string" ? new DatasetId(props.id) : props.id;

    const splits =
      props.splits?.map((s) => (typeof s === "string" ? new Split(s) : s)) ||
      [];

    return ok(
      new Dataset(
        id,
        props.name,
        props.description,
        props.examples || [],
        splits,
        props.metadata,
      ),
    );
  }

  get examples(): readonly Example[] {
    return this._examples;
  }

  get splits(): readonly Split[] {
    return this._splits;
  }

  addExample(example: Example): Result<void, ValidationError> {
    const existing = this._examples.find((e) => e.id === example.id);
    if (existing) {
      return err(
        new ValidationError(`Example with ID ${example.id} already exists`),
      );
    }
    this._examples.push(example);
    return ok(undefined);
  }

  filterBySplits(splits: string[]): Example[] {
    if (splits.length === 0) {
      return [...this._examples];
    }
    // Check if any of the example's splits match any of the requested splits
    return this._examples.filter((e) =>
      e.splits && splits.some(split => e.splits!.includes(split))
    );
  }

  countExamples(splits?: string[]): number {
    if (!splits || splits.length === 0) {
      return this._examples.length;
    }
    return this.filterBySplits(splits).length;
  }

  validate(): Result<void, ValidationError> {
    if (this._examples.length === 0) {
      return err(
        new ValidationError("Dataset must contain at least one example"),
      );
    }
    return ok(undefined);
  }

  isEmpty(): boolean {
    return this._examples.length === 0;
  }

  hasSplit(split: string): boolean {
    return this._splits.some((s) => s.value === split);
  }
}
