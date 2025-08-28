import { Result } from "../../shared/types/result.js";
import { ValidationError } from "../../shared/errors/domain.errors.js";

/**
 * Immutable value object representing a unique prompt identifier.
 * Ensures valid format and encapsulates prompt identity business rules.
 */
export class PromptId {
  // #region Constants
  private static readonly MIN_LENGTH = 3;
  private static readonly MAX_LENGTH = 100;
  private static readonly VALID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*$/;
  // #endregion

  private constructor(private readonly value: string) {}

  // #region Factory Methods
  /**
   * Creates a new PromptId with validation.
   * @param value - The string value to convert to PromptId
   * @returns Result<PromptId, ValidationError> - Success with PromptId or failure with validation error
   */
  static create(value: string): Result<PromptId, ValidationError> {
    if (!value || typeof value !== "string") {
      return Result.failure(
        new ValidationError("Prompt ID must be a non-empty string", "promptId"),
      );
    }

    const trimmedValue = value.trim();

    if (trimmedValue.length < PromptId.MIN_LENGTH) {
      return Result.failure(
        new ValidationError(
          `Prompt ID must be at least ${PromptId.MIN_LENGTH} characters long`,
          "promptId",
        ),
      );
    }

    if (trimmedValue.length > PromptId.MAX_LENGTH) {
      return Result.failure(
        new ValidationError(
          `Prompt ID must not exceed ${PromptId.MAX_LENGTH} characters`,
          "promptId",
        ),
      );
    }

    if (!PromptId.VALID_PATTERN.test(trimmedValue)) {
      return Result.failure(
        new ValidationError(
          "Prompt ID must start with alphanumeric and contain only alphanumeric characters, hyphens, underscores, and dots",
          "promptId",
        ),
      );
    }

    return Result.success(new PromptId(trimmedValue));
  }

  /**
   * Alias for create method, providing string conversion interface.
   * @param value - The string value to convert to PromptId
   * @returns Result<PromptId, ValidationError> - Success with PromptId or failure with validation error
   */
  static fromString(value: string): Result<PromptId, ValidationError> {
    return PromptId.create(value);
  }
  // #endregion

  // #region Getters
  /**
   * Returns the underlying string value.
   * @returns string - The raw prompt ID value
   */
  getValue(): string {
    return this.value;
  }

  /**
   * String representation for serialization.
   * @returns string - The prompt ID as a string
   */
  toString(): string {
    return this.value;
  }
  // #endregion

  // #region Comparison
  /**
   * Value equality comparison with another PromptId.
   * @param other - The PromptId to compare with
   * @returns boolean - True if values are equal
   */
  equals(other: PromptId): boolean {
    return this.value === other.value;
  }
  // #endregion
}
