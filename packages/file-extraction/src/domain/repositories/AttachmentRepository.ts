import { Result, NotFoundError } from "@the-project-b/types";
import { AttachmentId } from "../value-objects/AttachmentId.value-object.js";

export type Attachment = {
  id: AttachmentId;
  ritaThreadItemId: string;
  filename: string;
  fileSize: number;
  s3Path: string;
  s3Bucket: string;
  mimeType?: string;
  fileExpiresAt?: Date;
  createdAt: Date;
};

/**
 * Repository interface for attachment data access.
 * Defines contracts for fetching attachment metadata.
 */
export interface AttachmentRepository {
  /**
   * Finds an attachment by its ID.
   */
  findById(id: AttachmentId): Promise<Result<Attachment, NotFoundError>>;

  /**
   * Finds multiple attachments by their IDs.
   */
  findByIds(ids: AttachmentId[]): Promise<Result<Attachment[], NotFoundError>>;
}
