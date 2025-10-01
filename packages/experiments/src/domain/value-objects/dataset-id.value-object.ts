import { ValidationError, asNonEmptyString } from "@the-project-b/types";

/**
 * Dataset identifier value object
 */
export class DatasetId {
  private readonly _value: string;

  constructor(value: string) {
    try {
      this._value = asNonEmptyString(value);
    } catch (error) {
      throw new ValidationError(`Invalid dataset ID: ${value}`);
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: DatasetId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  static fromString(value: string): DatasetId {
    return new DatasetId(value);
  }
}
