import { Result, ok, err, ValidationError } from "@the-project-b/types";
import { AttachmentId } from "../value-objects/AttachmentId.value-object.js";
import { ExtractionStatus } from "../value-objects/ExtractionStatus.value-object.js";

export type ExtractionJobProps = {
  id: string;
  attachmentId: AttachmentId;
  status: ExtractionStatus;
  attemptNumber: number;
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string;
};

/**
 * Entity representing an extraction job.
 * Manages job lifecycle and status transitions with business rules.
 */
export class ExtractionJob {
  private constructor(private props: ExtractionJobProps) {}

  private static readonly MAX_ATTEMPTS = 10;

  /**
   * Creates an ExtractionJob entity with validation.
   */
  static create(
    props: Omit<
      ExtractionJobProps,
      "createdAt" | "updatedAt" | "attemptNumber" | "status"
    >,
  ): Result<ExtractionJob, ValidationError> {
    const now = new Date();

    const jobProps: ExtractionJobProps = {
      ...props,
      status: ExtractionStatus.pending(),
      attemptNumber: 1,
      createdAt: now,
      updatedAt: now,
    };

    return ok(new ExtractionJob(jobProps));
  }

  /**
   * Reconstitutes an ExtractionJob from stored data.
   */
  static reconstitute(props: ExtractionJobProps): ExtractionJob {
    return new ExtractionJob(props);
  }

  /**
   * Returns the job ID.
   */
  getId(): string {
    return this.props.id;
  }

  /**
   * Returns the attachment ID.
   */
  getAttachmentId(): AttachmentId {
    return this.props.attachmentId;
  }

  /**
   * Returns the current status.
   */
  getStatus(): ExtractionStatus {
    return this.props.status;
  }

  /**
   * Returns the current attempt number.
   */
  getAttemptNumber(): number {
    return this.props.attemptNumber;
  }

  /**
   * Returns the error message if any.
   */
  getErrorMessage(): string | undefined {
    return this.props.errorMessage;
  }

  /**
   * Returns the creation date.
   */
  getCreatedAt(): Date {
    return this.props.createdAt;
  }

  /**
   * Returns the last update date.
   */
  getUpdatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Marks the job as started.
   */
  start(): Result<void, ValidationError> {
    const processingStatus = ExtractionStatus.processing();

    if (!this.props.status.canTransitionTo(processingStatus)) {
      return err(
        new ValidationError("Cannot start job from current status", {
          currentStatus: this.props.status.toString(),
          targetStatus: "processing",
        }),
      );
    }

    this.props.status = processingStatus;
    this.props.updatedAt = new Date();

    return ok(undefined);
  }

  /**
   * Marks the job as completed.
   */
  complete(): Result<void, ValidationError> {
    const completedStatus = ExtractionStatus.completed();

    if (!this.props.status.canTransitionTo(completedStatus)) {
      return err(
        new ValidationError("Cannot complete job from current status", {
          currentStatus: this.props.status.toString(),
          targetStatus: "completed",
        }),
      );
    }

    this.props.status = completedStatus;
    this.props.updatedAt = new Date();
    this.props.errorMessage = undefined;

    return ok(undefined);
  }

  /**
   * Marks the job as failed with an error message.
   */
  fail(errorMessage: string): Result<void, ValidationError> {
    const failedStatus = ExtractionStatus.failed();

    if (!this.props.status.canTransitionTo(failedStatus)) {
      return err(
        new ValidationError("Cannot fail job from current status", {
          currentStatus: this.props.status.toString(),
          targetStatus: "failed",
        }),
      );
    }

    this.props.status = failedStatus;
    this.props.errorMessage = errorMessage;
    this.props.updatedAt = new Date();

    return ok(undefined);
  }

  /**
   * Increments the attempt number for retry.
   */
  retry(): Result<void, ValidationError> {
    if (this.props.attemptNumber >= ExtractionJob.MAX_ATTEMPTS) {
      return err(
        new ValidationError("Maximum retry attempts exceeded", {
          attemptNumber: this.props.attemptNumber,
          maxAttempts: ExtractionJob.MAX_ATTEMPTS,
        }),
      );
    }

    const processingStatus = ExtractionStatus.processing();

    if (!this.props.status.canTransitionTo(processingStatus)) {
      return err(
        new ValidationError("Cannot retry job from current status", {
          currentStatus: this.props.status.toString(),
        }),
      );
    }

    this.props.attemptNumber += 1;
    this.props.status = processingStatus;
    this.props.updatedAt = new Date();

    return ok(undefined);
  }

  /**
   * Checks if the job can be retried.
   */
  canRetry(): boolean {
    return (
      this.props.status.isFailed() &&
      this.props.attemptNumber < ExtractionJob.MAX_ATTEMPTS
    );
  }

  /**
   * Checks if the job is in a terminal state.
   */
  isTerminal(): boolean {
    return this.props.status.isCompleted() || !this.canRetry();
  }
}
