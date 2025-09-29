import { Result, ValidationError, ok, err } from "@the-project-b/types";

export enum RitaThreadTriggerType {
  Evaluation = "EVALUATION",
  Manual = "MANUAL",
  Email = "EMAIL",
}

export enum RitaThreadStatus {
  Received = "RECEIVED",
  Processing = "PROCESSING",
  Completed = "COMPLETED",
  Failed = "FAILED",
}

/**
 * RitaThread entity - represents an evaluation thread for tracking graph execution
 */
export class RitaThread {
  private constructor(
    public readonly id: string,
    public readonly lcThreadId: string,
    public readonly triggerType: RitaThreadTriggerType,
    public readonly hrCompanyId: string,
    public readonly status: RitaThreadStatus,
    public readonly title?: string,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
  ) {}

  static create(props: {
    id: string;
    lcThreadId: string;
    triggerType: RitaThreadTriggerType;
    hrCompanyId: string;
    status: RitaThreadStatus;
    title?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }): Result<RitaThread, ValidationError> {
    if (!props.id) {
      return err(new ValidationError("Thread ID is required"));
    }

    if (!props.lcThreadId) {
      return err(new ValidationError("LangGraph thread ID is required"));
    }

    if (!props.hrCompanyId) {
      return err(new ValidationError("Company ID is required"));
    }

    return ok(
      new RitaThread(
        props.id,
        props.lcThreadId,
        props.triggerType,
        props.hrCompanyId,
        props.status,
        props.title,
        props.createdAt,
        props.updatedAt,
      ),
    );
  }

  updateStatus(status: RitaThreadStatus): void {
    (this as any).status = status;
  }

  updateTitle(title: string): void {
    (this as any).title = title;
  }
}
