import { Result, ok, err, ValidationError } from "@the-project-b/types";

export type ConfidenceLevel = "low" | "medium" | "high";

/**
 * Value object representing a confidence score from 0 to 1.
 * Provides threshold-based classification and validation.
 */
export class ConfidenceScore {
  private constructor(private readonly value: number) {}

  private static readonly MIN_SCORE = 0;
  private static readonly MAX_SCORE = 1;
  private static readonly LOW_THRESHOLD = 0.7;
  private static readonly HIGH_THRESHOLD = 0.9;

  /**
   * Creates a ConfidenceScore from a numeric value.
   */
  static create(score: number): Result<ConfidenceScore, ValidationError> {
    if (score < this.MIN_SCORE || score > this.MAX_SCORE) {
      return err(
        new ValidationError("Confidence score must be between 0 and 1", {
          field: "score",
          value: score,
          min: this.MIN_SCORE,
          max: this.MAX_SCORE,
        }),
      );
    }

    if (isNaN(score) || !isFinite(score)) {
      return err(
        new ValidationError("Confidence score must be a valid number", {
          field: "score",
          value: score,
        }),
      );
    }

    return ok(new ConfidenceScore(score));
  }

  /**
   * Returns the numeric value of the confidence score.
   */
  getValue(): number {
    return this.value;
  }

  /**
   * Returns the confidence level based on thresholds.
   */
  getLevel(): ConfidenceLevel {
    if (this.value < ConfidenceScore.LOW_THRESHOLD) {
      return "low";
    }
    if (this.value < ConfidenceScore.HIGH_THRESHOLD) {
      return "medium";
    }
    return "high";
  }

  /**
   * Checks if the confidence is low (< 0.7).
   */
  isLow(): boolean {
    return this.value < ConfidenceScore.LOW_THRESHOLD;
  }

  /**
   * Checks if the confidence is medium (0.7 <= x < 0.9).
   */
  isMedium(): boolean {
    return (
      this.value >= ConfidenceScore.LOW_THRESHOLD &&
      this.value < ConfidenceScore.HIGH_THRESHOLD
    );
  }

  /**
   * Checks if the confidence is high (>= 0.9).
   */
  isHigh(): boolean {
    return this.value >= ConfidenceScore.HIGH_THRESHOLD;
  }

  /**
   * Returns a percentage representation (0-100).
   */
  toPercentage(): number {
    return Math.round(this.value * 100);
  }

  /**
   * Checks equality with another ConfidenceScore.
   */
  equals(other: ConfidenceScore): boolean {
    return Math.abs(this.value - other.value) < 0.0001;
  }
}
