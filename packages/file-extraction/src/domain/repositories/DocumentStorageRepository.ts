import { Result, InfrastructureError } from "@the-project-b/types";

/**
 * Repository interface for document storage operations.
 * Defines contracts for S3 or similar storage access.
 */
export interface DocumentStorageRepository {
  /**
   * Downloads a document from storage.
   */
  download(s3Path: string): Promise<Result<Buffer, InfrastructureError>>;

  /**
   * Uploads a document to storage.
   */
  upload(
    path: string,
    content: Buffer,
  ): Promise<Result<void, InfrastructureError>>;

  /**
   * Generates a presigned URL for temporary access.
   */
  getPresignedUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<Result<string, InfrastructureError>>;

  /**
   * Checks if a document exists at the given path.
   */
  exists(path: string): Promise<Result<boolean, InfrastructureError>>;
}
