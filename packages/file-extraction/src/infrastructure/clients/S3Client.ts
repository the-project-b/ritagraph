import {
  S3Client as AWSS3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Result, ok, err, InfrastructureError } from "@the-project-b/types";
import { createLogger, normalizeError } from "@the-project-b/logging";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "S3Client",
});

export type S3Object = {
  key: string;
  size: number;
  lastModified?: Date;
};

/**
 * Client for AWS S3 operations.
 * Wraps AWS SDK with Result pattern and structured logging.
 */
export class S3Client {
  private readonly client: AWSS3Client;

  constructor(region?: string) {
    this.client = new AWSS3Client({
      region: region || process.env.AWS_REGION || "eu-central-1",
    });

    logger.info("S3Client initialized", {
      region: region || process.env.AWS_REGION || "eu-central-1",
    });
  }

  /**
   * Downloads a file from S3.
   */
  async download(
    bucket: string,
    key: string,
  ): Promise<Result<Buffer, InfrastructureError>> {
    try {
      logger.info("Downloading from S3", { bucket, key });

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return err(
          new InfrastructureError(
            "S3 response body is empty",
            "S3_EMPTY_BODY",
            { bucket, key },
          ),
        );
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      logger.info("Downloaded from S3", {
        bucket,
        key,
        sizeBytes: buffer.length,
      });

      return ok(buffer);
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);
      const awsError = error as { Code?: string };

      logger.error("Failed to download from S3", normalizedError, {
        bucket,
        key,
        errorCode: awsError.Code,
        errorMessage: message,
      });

      return err(
        new InfrastructureError(
          `S3 download failed: ${message}`,
          "S3_DOWNLOAD_ERROR",
          { bucket, key, error: message, code: awsError.Code },
        ),
      );
    }
  }

  /**
   * Uploads a file to S3.
   */
  async upload(
    bucket: string,
    key: string,
    content: Buffer,
  ): Promise<Result<void, InfrastructureError>> {
    try {
      logger.info("Uploading to S3", {
        bucket,
        key,
        sizeBytes: content.length,
      });

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
      });

      await this.client.send(command);

      logger.info("Uploaded to S3", { bucket, key });

      return ok(undefined);
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);
      const awsError = error as { Code?: string };

      logger.error("Failed to upload to S3", normalizedError, {
        bucket,
        key,
        errorCode: awsError.Code,
        errorMessage: message,
      });

      return err(
        new InfrastructureError(
          `S3 upload failed: ${message}`,
          "S3_UPLOAD_ERROR",
          { bucket, key, error: message, code: awsError.Code },
        ),
      );
    }
  }

  /**
   * Generates a presigned URL for temporary access.
   */
  async getPresignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number = 3600,
  ): Promise<Result<string, InfrastructureError>> {
    try {
      logger.info("Generating presigned URL", {
        bucket,
        key,
        expiresInSeconds,
      });

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });

      logger.info("Generated presigned URL", { bucket, key });

      return ok(url);
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);

      logger.error("Failed to generate presigned URL", normalizedError, {
        bucket,
        key,
        errorMessage: message,
      });

      return err(
        new InfrastructureError(
          `Failed to generate presigned URL: ${message}`,
          "S3_PRESIGNED_URL_ERROR",
          { bucket, key, error: message },
        ),
      );
    }
  }

  /**
   * Checks if an object exists in S3.
   */
  async exists(
    bucket: string,
    key: string,
  ): Promise<Result<boolean, InfrastructureError>> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);

      return ok(true);
    } catch (error) {
      const awsError = error as { name?: string; Code?: string };
      if (awsError.name === "NotFound" || awsError.Code === "NotFound") {
        return ok(false);
      }

      const { error: normalizedError, message } = normalizeError(error);

      logger.error("Failed to check S3 object existence", normalizedError, {
        bucket,
        key,
        errorMessage: message,
      });

      return err(
        new InfrastructureError(
          `Failed to check S3 object existence: ${message}`,
          "S3_HEAD_OBJECT_ERROR",
          { bucket, key, error: message },
        ),
      );
    }
  }

  /**
   * Lists objects in an S3 bucket with a given prefix.
   */
  async listObjects(
    bucket: string,
    prefix: string,
  ): Promise<Result<S3Object[], InfrastructureError>> {
    try {
      logger.info("Listing S3 objects", { bucket, prefix });

      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      });

      const response = await this.client.send(command);

      const objects: S3Object[] =
        response.Contents?.map((obj) => ({
          key: obj.Key,
          size: obj.Size || 0,
          lastModified: obj.LastModified,
        })) || [];

      logger.info("Listed S3 objects", {
        bucket,
        prefix,
        count: objects.length,
      });

      return ok(objects);
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);

      logger.error("Failed to list S3 objects", normalizedError, {
        bucket,
        prefix,
        errorMessage: message,
      });

      return err(
        new InfrastructureError(
          `Failed to list S3 objects: ${message}`,
          "S3_LIST_OBJECTS_ERROR",
          { bucket, prefix, error: message },
        ),
      );
    }
  }
}
