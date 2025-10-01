import { ValidationError, asNonEmptyString } from "@the-project-b/types";

/**
 * Dataset split value object (e.g., "train", "test", "validation")
 */
export class Split {
  private readonly _value: string;

  constructor(value: string) {
    try {
      this._value = asNonEmptyString(value).toLowerCase();
    } catch (error) {
      throw new ValidationError(`Invalid split: ${value}`);
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: Split): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  static fromString(value: string): Split {
    return new Split(value);
  }

  static fromArray(values: string[]): Split[] {
    return values.map((v) => new Split(v));
  }
}
