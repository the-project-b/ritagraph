import { ValidationError, asNonEmptyString } from "@the-project-b/types";

/**
 * Experiment identifier value object
 */
export class ExperimentId {
  private readonly _value: string;

  constructor(value: string) {
    try {
      this._value = asNonEmptyString(value);
    } catch (error) {
      throw new ValidationError(`Invalid experiment ID: ${value}`);
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: ExperimentId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  static fromString(value: string): ExperimentId {
    return new ExperimentId(value);
  }
}
