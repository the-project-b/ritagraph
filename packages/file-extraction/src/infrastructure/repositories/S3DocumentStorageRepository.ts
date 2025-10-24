import { Result, InfrastructureError } from "@the-project-b/types";
import { DocumentStorageRepository } from "../../domain/repositories/DocumentStorageRepository.js";
import { S3Client } from "../clients/S3Client.js";

/**
 * Implementation of DocumentStorageRepository using AWS S3.
 */
export class S3DocumentStorageRepository implements DocumentStorageRepository {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucket: string,
  ) {}

  async download(s3Path: string): Promise<Result<Buffer, InfrastructureError>> {
    return this.s3Client.download(this.bucket, s3Path);
  }

  async upload(
    path: string,
    content: Buffer,
  ): Promise<Result<void, InfrastructureError>> {
    return this.s3Client.upload(this.bucket, path, content);
  }

  async getPresignedUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<Result<string, InfrastructureError>> {
    return this.s3Client.getPresignedUrl(this.bucket, path, expiresInSeconds);
  }

  async exists(path: string): Promise<Result<boolean, InfrastructureError>> {
    return this.s3Client.exists(this.bucket, path);
  }
}
