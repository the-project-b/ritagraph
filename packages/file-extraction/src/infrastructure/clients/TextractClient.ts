import {
  TextractClient as AWSTextractClient,
  AnalyzeDocumentCommand,
  Block,
  DetectDocumentTextCommand,
  DocumentMetadata,
  FeatureType,
  GetDocumentAnalysisCommand,
  JobStatus,
  StartDocumentAnalysisCommand,
} from "@aws-sdk/client-textract";
import { createLogger, normalizeError } from "@the-project-b/logging";
import {
  ExternalServiceError,
  Result,
  TimeoutError,
  err,
  isErr,
  ok,
} from "@the-project-b/types";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "TextractClient",
});

export type S3Location = {
  bucket: string;
  key: string;
};

export type TextractResponse = {
  blocks: Block[];
  metadata?: DocumentMetadata;
  jobId?: string;
};

/**
 * Client for AWS Textract operations.
 * Wraps AWS SDK with Result pattern and structured logging.
 */
export class TextractClient {
  private readonly client: AWSTextractClient;

  constructor(region?: string) {
    this.client = new AWSTextractClient({
      region: region || process.env.AWS_REGION || "eu-central-1",
    });

    logger.info("TextractClient initialized", {
      region: region || process.env.AWS_REGION || "eu-central-1",
    });
  }

  /**
   * Detects text in a document synchronously (simple text extraction).
   */
  async detectDocumentText(
    document: Buffer | S3Location,
  ): Promise<Result<TextractResponse, ExternalServiceError>> {
    try {
      const isBuffer = Buffer.isBuffer(document);

      logger.info("Detecting document text", {
        documentSize: isBuffer ? document.length : undefined,
        s3Location: !isBuffer ? document : undefined,
      });

      const command = new DetectDocumentTextCommand({
        Document: isBuffer
          ? { Bytes: document }
          : {
              S3Object: {
                Bucket: (document as S3Location).bucket,
                Name: (document as S3Location).key,
              },
            },
      });

      const response = await this.client.send(command);

      logger.info("Document text detected", {
        blockCount: response.Blocks?.length || 0,
      });

      return ok({
        blocks: response.Blocks || [],
        metadata: response.DocumentMetadata,
      });
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);
      const awsError = error as {
        Code?: string;
        $metadata?: { httpStatusCode?: number };
      };

      logger.error("Failed to detect document text", normalizedError, {
        errorMessage: message,
        errorCode: awsError.Code,
      });

      return err(
        new ExternalServiceError(
          "AWS Textract",
          `Failed to detect document text: ${message}`,
          awsError.$metadata?.httpStatusCode || 500,
          { error: message, code: awsError.Code },
        ),
      );
    }
  }

  /**
   * Analyzes a document synchronously with advanced features (forms, tables, layout).
   */
  async analyzeDocument(
    document: Buffer | S3Location,
    features: FeatureType[],
  ): Promise<Result<TextractResponse, ExternalServiceError>> {
    try {
      const isBuffer = Buffer.isBuffer(document);

      logger.info("Analyzing document", {
        documentSize: isBuffer ? document.length : undefined,
        s3Location: !isBuffer ? document : undefined,
        features,
      });

      const command = new AnalyzeDocumentCommand({
        Document: isBuffer
          ? { Bytes: document }
          : {
              S3Object: {
                Bucket: (document as S3Location).bucket,
                Name: (document as S3Location).key,
              },
            },
        FeatureTypes: features,
      });

      const response = await this.client.send(command);

      logger.info("Document analyzed", {
        blockCount: response.Blocks?.length || 0,
        features,
      });

      return ok({
        blocks: response.Blocks || [],
        metadata: response.DocumentMetadata,
      });
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);
      const awsError = error as {
        Code?: string;
        $metadata?: { httpStatusCode?: number };
      };

      logger.error("Failed to analyze document", normalizedError, {
        errorMessage: message,
        errorCode: awsError.Code,
        features,
      });

      return err(
        new ExternalServiceError(
          "AWS Textract",
          `Failed to analyze document: ${message}`,
          awsError.$metadata?.httpStatusCode || 500,
          { error: message, code: awsError.Code, features },
        ),
      );
    }
  }

  /**
   * Starts an asynchronous document analysis job.
   */
  async startDocumentAnalysis(
    s3Location: S3Location,
    features: FeatureType[],
  ): Promise<Result<string, ExternalServiceError>> {
    try {
      logger.info("Starting document analysis", {
        s3Location,
        features,
      });

      const command = new StartDocumentAnalysisCommand({
        DocumentLocation: {
          S3Object: {
            Bucket: s3Location.bucket,
            Name: s3Location.key,
          },
        },
        FeatureTypes: features,
      });

      const response = await this.client.send(command);

      if (!response.JobId) {
        return err(
          new ExternalServiceError(
            "AWS Textract",
            "No JobId returned from StartDocumentAnalysis",
            500,
            { s3Location, features },
          ),
        );
      }

      logger.info("Document analysis started", {
        jobId: response.JobId,
        s3Location,
      });

      return ok(response.JobId);
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);
      const awsError = error as {
        Code?: string;
        $metadata?: { httpStatusCode?: number };
      };

      logger.error("Failed to start document analysis", normalizedError, {
        errorMessage: message,
        errorCode: awsError.Code,
        s3Location,
        features,
      });

      return err(
        new ExternalServiceError(
          "AWS Textract",
          `Failed to start document analysis: ${message}`,
          awsError.$metadata?.httpStatusCode || 500,
          { error: message, code: awsError.Code, s3Location, features },
        ),
      );
    }
  }

  /**
   * Gets the results of an asynchronous document analysis job.
   */
  async getDocumentAnalysis(
    jobId: string,
  ): Promise<
    Result<
      { status: JobStatus; response?: TextractResponse },
      ExternalServiceError
    >
  > {
    try {
      logger.info("Getting document analysis", { jobId });

      const command = new GetDocumentAnalysisCommand({
        JobId: jobId,
      });

      const response = await this.client.send(command);

      if (!response.JobStatus) {
        return err(
          new ExternalServiceError(
            "AWS Textract",
            "No JobStatus returned from GetDocumentAnalysis",
            500,
            { jobId },
          ),
        );
      }

      const status = response.JobStatus;

      if (status === JobStatus.SUCCEEDED) {
        logger.info("Document analysis succeeded", {
          jobId,
          blockCount: response.Blocks?.length || 0,
        });

        return ok({
          status,
          response: {
            blocks: response.Blocks || [],
            metadata: response.DocumentMetadata,
            jobId,
          },
        });
      }

      if (status === JobStatus.FAILED) {
        logger.error(
          "Document analysis failed",
          new Error(response.StatusMessage || "Unknown error"),
          {
            jobId,
            statusMessage: response.StatusMessage,
          },
        );

        return err(
          new ExternalServiceError(
            "AWS Textract",
            `Document analysis failed: ${response.StatusMessage || "Unknown error"}`,
            500,
            { jobId, statusMessage: response.StatusMessage },
          ),
        );
      }

      logger.info("Document analysis in progress", {
        jobId,
        status,
      });

      return ok({ status });
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);
      const awsError = error as {
        Code?: string;
        $metadata?: { httpStatusCode?: number };
      };

      logger.error("Failed to get document analysis", normalizedError, {
        errorMessage: message,
        errorCode: awsError.Code,
        jobId,
      });

      return err(
        new ExternalServiceError(
          "AWS Textract",
          `Failed to get document analysis: ${message}`,
          awsError.$metadata?.httpStatusCode || 500,
          { error: message, code: awsError.Code, jobId },
        ),
      );
    }
  }

  /**
   * Polls a Textract job until completion with timeout.
   */
  async pollJobUntilComplete(
    jobId: string,
    pollIntervalMs: number = 2000,
    timeoutMs: number = 300000,
  ): Promise<Result<TextractResponse, ExternalServiceError | TimeoutError>> {
    const startTime = Date.now();

    while (true) {
      if (Date.now() - startTime > timeoutMs) {
        logger.error("Textract job polling timed out", new Error("Timeout"), {
          jobId,
          timeoutMs,
        });

        return err(
          new TimeoutError(timeoutMs, "Textract job polling", { jobId }),
        );
      }

      const result = await this.getDocumentAnalysis(jobId);

      if (isErr(result)) {
        return err(result.error);
      }

      const { status, response } = result.value;

      if (status === JobStatus.SUCCEEDED && response) {
        return ok(response);
      }

      if (status === JobStatus.FAILED) {
        return err(
          new ExternalServiceError("AWS Textract", "Textract job failed", 500, {
            jobId,
            status,
          }),
        );
      }

      await this.sleep(pollIntervalMs);
    }
  }

  /**
   * Sleep utility for polling.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
