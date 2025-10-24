import { Result, ok, err, ValidationError } from "@the-project-b/types";

export type ExtractionStatusType =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/**
 * Value object representing the status of an extraction job.
 * Enforces valid status transitions and provides status checking methods.
 */
export class ExtractionStatus {
  private constructor(private readonly value: ExtractionStatusType) {}

  private static readonly VALID_STATUSES: ExtractionStatusType[] = [
    "pending",
    "processing",
    "completed",
    "failed",
  ];

  private static readonly VALID_TRANSITIONS: Record<
    ExtractionStatusType,
    ExtractionStatusType[]
  > = {
    pending: ["processing", "failed"],
    processing: ["completed", "failed", "processing"],
    completed: [],
    failed: ["processing"],
  };

  /**
   * Creates an ExtractionStatus from a string value.
   */
  static create(status: string): Result<ExtractionStatus, ValidationError> {
    if (!this.VALID_STATUSES.includes(status as ExtractionStatusType)) {
      return err(
        new ValidationError("Invalid extraction status", {
          field: "status",
          value: status,
          validValues: this.VALID_STATUSES,
        }),
      );
    }

    return ok(new ExtractionStatus(status as ExtractionStatusType));
  }

  /**
   * Creates a pending status.
   */
  static pending(): ExtractionStatus {
    return new ExtractionStatus("pending");
  }

  /**
   * Creates a processing status.
   */
  static processing(): ExtractionStatus {
    return new ExtractionStatus("processing");
  }

  /**
   * Creates a completed status.
   */
  static completed(): ExtractionStatus {
    return new ExtractionStatus("completed");
  }

  /**
   * Creates a failed status.
   */
  static failed(): ExtractionStatus {
    return new ExtractionStatus("failed");
  }

  /**
   * Validates if transition to a new status is allowed.
   */
  canTransitionTo(newStatus: ExtractionStatus): boolean {
    const allowedTransitions = ExtractionStatus.VALID_TRANSITIONS[this.value];
    return allowedTransitions.includes(newStatus.value);
  }

  /**
   * Returns the string representation of the status.
   */
  toString(): string {
    return this.value;
  }

  /**
   * Checks if the status is pending.
   */
  isPending(): boolean {
    return this.value === "pending";
  }

  /**
   * Checks if the status is processing.
   */
  isProcessing(): boolean {
    return this.value === "processing";
  }

  /**
   * Checks if the status is completed.
   */
  isCompleted(): boolean {
    return this.value === "completed";
  }

  /**
   * Checks if the status is failed.
   */
  isFailed(): boolean {
    return this.value === "failed";
  }

  /**
   * Checks equality with another ExtractionStatus.
   */
  equals(other: ExtractionStatus): boolean {
    return this.value === other.value;
  }
}
