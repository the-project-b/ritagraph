import { Result, ValidationError, err, ok } from "@the-project-b/types";

/**
 * DataChangeProposal value object - represents a proposed change to data
 */
export class DataChangeProposal {
  private constructor(
    public readonly changeType: "creation" | "change",
    public readonly changedField?: string,
    public readonly newValue?: string,
    public readonly relatedUserId?: string,
    public readonly mutationQuery?: {
      propertyPath?: string;
      variables?: Record<string, unknown>;
    },
    public readonly mutationVariables?: Record<string, unknown>,
    public readonly quote?: string,
    public readonly additionalData?: Record<string, unknown>,
  ) {}

  static create(props: {
    changeType: "creation" | "change";
    changedField?: string;
    newValue?: string;
    relatedUserId?: string;
    mutationQuery?: {
      propertyPath?: string;
      variables?: Record<string, unknown>;
    };
    mutationVariables?: Record<string, unknown>;
    quote?: string;
    [key: string]: unknown;
  }): Result<DataChangeProposal, ValidationError> {
    if (!props.changeType) {
      return err(new ValidationError("changeType is required"));
    }

    if (!["creation", "change"].includes(props.changeType)) {
      return err(new ValidationError("changeType must be 'creation' or 'change'"));
    }

    // Extract additional properties that aren't part of the main structure
    const {
      changeType,
      changedField,
      newValue,
      relatedUserId,
      mutationQuery,
      mutationVariables,
      quote,
      ...additionalData
    } = props;

    return ok(
      new DataChangeProposal(
        changeType,
        changedField,
        newValue,
        relatedUserId,
        mutationQuery,
        mutationVariables,
        quote,
        additionalData,
      ),
    );
  }

  /**
   * Convert to plain object for serialization
   */
  toPlainObject(): Record<string, unknown> {
    return {
      changeType: this.changeType,
      changedField: this.changedField,
      newValue: this.newValue,
      relatedUserId: this.relatedUserId,
      mutationQuery: this.mutationQuery,
      mutationVariables: this.mutationVariables,
      quote: this.quote,
      ...this.additionalData,
    };
  }

  /**
   * Create from plain object (for deserialization)
   */
  static fromPlainObject(obj: Record<string, unknown>): Result<DataChangeProposal, ValidationError> {
    return DataChangeProposal.create(obj as any);
  }

  /**
   * Check if this proposal represents a creation operation
   */
  isCreation(): boolean {
    return this.changeType === "creation";
  }

  /**
   * Check if this proposal represents a change operation
   */
  isChange(): boolean {
    return this.changeType === "change";
  }

  /**
   * Get additional data by key
   */
  getAdditionalData(key: string): unknown {
    return this.additionalData?.[key];
  }
}