import { Result, ok, err, ValidationError } from "@the-project-b/types";

/**
 * Value object representing a unique attachment identifier.
 * Validates that the ID is a non-empty string.
 */
export class AttachmentId {
  private constructor(private readonly value: string) {}

  /**
   * Creates an AttachmentId from a string value.
   */
  static create(id: string): Result<AttachmentId, ValidationError> {
    if (!id || id.trim().length === 0) {
      return err(
        new ValidationError("Attachment ID cannot be empty", {
          field: "id",
          value: id,
        }),
      );
    }

    return ok(new AttachmentId(id));
  }

  /**
   * Returns the string representation of the attachment ID.
   */
  toString(): string {
    return this.value;
  }

  /**
   * Checks equality with another AttachmentId.
   */
  equals(other: AttachmentId): boolean {
    return this.value === other.value;
  }
}
