import { Result, ok, err, ValidationError } from "@the-project-b/types";
import { DocumentType } from "../value-objects/DocumentType.value-object.js";
import { AttachmentId } from "../value-objects/AttachmentId.value-object.js";

export type DocumentProps = {
  id: AttachmentId;
  filename: string;
  type: DocumentType;
  sizeBytes: number;
  s3Path: string;
  s3Bucket: string;
};

/**
 * Entity representing a document to be processed.
 * Contains metadata and validation logic for document processing.
 */
export class Document {
  private constructor(private readonly props: DocumentProps) {}

  private static readonly MAX_SYNC_SIZE_BYTES = 5 * 1024 * 1024;
  private static readonly MAX_ASYNC_SIZE_BYTES = 500 * 1024 * 1024;
  private static readonly MIN_SIZE_BYTES = 1;

  /**
   * Creates a Document entity with validation.
   */
  static create(props: DocumentProps): Result<Document, ValidationError> {
    if (props.sizeBytes < this.MIN_SIZE_BYTES) {
      return err(
        new ValidationError("Document size must be at least 1 byte", {
          field: "sizeBytes",
          value: props.sizeBytes,
        }),
      );
    }

    if (props.sizeBytes > this.MAX_ASYNC_SIZE_BYTES) {
      return err(
        new ValidationError("Document exceeds maximum size limit", {
          field: "sizeBytes",
          value: props.sizeBytes,
          maxSize: this.MAX_ASYNC_SIZE_BYTES,
        }),
      );
    }

    if (!props.filename || props.filename.trim().length === 0) {
      return err(
        new ValidationError("Filename cannot be empty", {
          field: "filename",
          value: props.filename,
        }),
      );
    }

    if (!props.s3Path || props.s3Path.trim().length === 0) {
      return err(
        new ValidationError("S3 path cannot be empty", {
          field: "s3Path",
          value: props.s3Path,
        }),
      );
    }

    if (!props.s3Bucket || props.s3Bucket.trim().length === 0) {
      return err(
        new ValidationError("S3 bucket cannot be empty", {
          field: "s3Bucket",
          value: props.s3Bucket,
        }),
      );
    }

    return ok(new Document(props));
  }

  /**
   * Returns the attachment ID.
   */
  getId(): AttachmentId {
    return this.props.id;
  }

  /**
   * Returns the filename.
   */
  getFilename(): string {
    return this.props.filename;
  }

  /**
   * Returns the document type.
   */
  getType(): DocumentType {
    return this.props.type;
  }

  /**
   * Returns the size in bytes.
   */
  getSizeBytes(): number {
    return this.props.sizeBytes;
  }

  /**
   * Returns the S3 path.
   */
  getS3Path(): string {
    return this.props.s3Path;
  }

  /**
   * Returns the S3 bucket.
   */
  getS3Bucket(): string {
    return this.props.s3Bucket;
  }

  /**
   * Checks if the document can be processed.
   */
  isProcessable(): boolean {
    return (
      this.props.type.isTextractCompatible() || this.props.type.isArchive()
    );
  }

  /**
   * Checks if the document is an archive that needs extraction.
   */
  isArchive(): boolean {
    return this.props.type.isArchive();
  }

  /**
   * Returns the size in megabytes.
   */
  getSizeMB(): number {
    return this.props.sizeBytes / (1024 * 1024);
  }
}
