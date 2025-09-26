import { Result, ValidationError, err, ok } from "@the-project-b/types";

/**
 * Example entity - represents a single dataset example
 */
export class Example {
  private constructor(
    public readonly id: string,
    public readonly inputs: Record<string, any>,
    public readonly outputs?: Record<string, any>,
    public readonly metadata?: Record<string, any>,
    public readonly split?: string,
    public readonly datasetId?: string,
    public readonly createdAt?: Date,
  ) {}

  static create(props: {
    id: string;
    inputs: Record<string, any>;
    outputs?: Record<string, any>;
    metadata?: Record<string, any>;
    split?: string;
    datasetId?: string;
    createdAt?: Date;
  }): Result<Example, ValidationError> {
    if (!props.id) {
      return err(new ValidationError("Example ID is required"));
    }

    if (!props.inputs || Object.keys(props.inputs).length === 0) {
      return err(new ValidationError("Example inputs cannot be empty"));
    }

    return ok(
      new Example(
        props.id,
        props.inputs,
        props.outputs,
        props.metadata,
        props.split,
        props.datasetId,
        props.createdAt,
      ),
    );
  }

  hasOutput(): boolean {
    return this.outputs !== undefined && Object.keys(this.outputs).length > 0;
  }

  getInputValue(key: string): any {
    return this.inputs[key];
  }

  getOutputValue(key: string): any {
    return this.outputs?.[key];
  }

  matchesSplit(split: string): boolean {
    return this.split === split;
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      inputs: this.inputs,
      outputs: this.outputs,
      metadata: this.metadata,
      split: this.split,
      datasetId: this.datasetId,
      createdAt: this.createdAt?.toISOString(),
    };
  }
}
