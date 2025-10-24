import {
  Block,
  DocumentMetadata,
  FeatureType,
  JobStatus,
} from "@aws-sdk/client-textract";
import { createLogger } from "@the-project-b/logging";
import {
  ExternalServiceError,
  Result,
  TimeoutError,
  err,
  isErr,
  ok,
} from "@the-project-b/types";
import { ExtractionResultDto } from "../../application/dto/ExtractionResult.dto.js";
import { Document } from "../../domain/entities/Document.entity.js";
import { ConfidenceScore } from "../../domain/value-objects/ConfidenceScore.value-object.js";
import { ExtractionConfig } from "../../domain/value-objects/ExtractionConfig.value-object.js";
import { S3Client } from "../clients/S3Client.js";
import { TextractClient } from "../clients/TextractClient.js";
import { TextractCostTracker } from "../cost-tracking/TextractCostTracker.js";
import { TextractResponseParser } from "../parsers/TextractResponseParser.js";
import {
  ExtractionAdapter,
  ExtractionJobStatus,
} from "./ExtractionAdapter.interface.js";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "TextractAdapter",
});

/**
 * Adapter for AWS Textract extraction service.
 * All extraction uses async Textract API for reliability.
 * Supports both blocking (extractText) and non-blocking (job-based) patterns.
 */
export class TextractAdapter implements ExtractionAdapter {
  private readonly textractClient: TextractClient;
  private readonly s3Client: S3Client;
  private readonly parser: TextractResponseParser;

  constructor(
    textractClient?: TextractClient,
    s3Client?: S3Client,
    region?: string,
  ) {
    this.textractClient = textractClient || new TextractClient(region);
    this.s3Client = s3Client || new S3Client(region);
    this.parser = new TextractResponseParser();

    logger.info("TextractAdapter initialized");
  }

  /**
   * Returns the provider name.
   */
  getProviderName(): string {
    return "AWS Textract";
  }

  /**
   * Extracts text from a buffer directly using Textract synchronous API.
   * Suitable for files under 5MB and CLI usage.
   */
  async extractTextFromBuffer(
    buffer: Buffer,
    filename: string,
    config: ExtractionConfig,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>> {
    const startTime = Date.now();
    const costTracker = new TextractCostTracker();

    logger.info("Starting extraction from buffer", {
      filename,
      sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
      detailLevel: config.getDetailLevel(),
    });

    try {
      const features = this.mapFeatures(config);
      const analyzeResult = await this.textractClient.analyzeDocument(
        buffer,
        features,
      );

      if (isErr(analyzeResult)) {
        return err(analyzeResult.error);
      }

      const { blocks, metadata } = analyzeResult.value;
      const parseResult = this.parser.parse(blocks);

      if (isErr(parseResult)) {
        return err(
          new ExternalServiceError(
            "TextractAdapter",
            "Failed to parse Textract response",
            500,
            { error: parseResult.error },
          ),
        );
      }

      const { text, structuredData, confidence } = parseResult.value;
      const confidenceScoreResult = ConfidenceScore.create(confidence);

      if (isErr(confidenceScoreResult)) {
        return err(
          new ExternalServiceError(
            "TextractAdapter",
            "Invalid confidence score",
            500,
            { error: confidenceScoreResult.error },
          ),
        );
      }

      const pageCount = metadata?.Pages || 1;
      costTracker.trackApiCall("AnalyzeDocument", pageCount);

      const processingTimeMs = Date.now() - startTime;
      const result: ExtractionResultDto = {
        attachmentId: "local-file",
        filename,
        extractedText: text,
        structuredData,
        metadata: {
          pageCount,
          confidence,
          language: "unknown",
          processingTimeMs,
        },
        cost: costTracker.getCurrentCost(),
      };

      logger.info("Extraction from buffer completed", {
        filename,
        textLength: text.length,
        confidence,
        processingTimeMs,
        cost: costTracker.getCurrentCost(),
      });

      return ok(result);
    } catch (error) {
      logger.error("Extraction from buffer failed", error as Error, {
        filename,
      });

      return err(
        new ExternalServiceError(
          "TextractAdapter",
          `Extraction failed: ${(error as Error).message}`,
          500,
          { filename },
        ),
      );
    }
  }

  /**
   * Extracts text and structured data from a document (blocking).
   * Starts async job and polls until completion.
   */
  async extractText(
    document: Document,
    config: ExtractionConfig,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>> {
    const startTime = Date.now();
    const costTracker = new TextractCostTracker();

    logger.info("Starting extraction (blocking mode)", {
      filename: document.getFilename(),
      type: document.getType().toString(),
      sizeMB: document.getSizeMB(),
      detailLevel: config.getDetailLevel(),
    });

    try {
      if (document.isArchive()) {
        return err(
          new ExternalServiceError(
            "TextractAdapter",
            "Archive extraction not implemented in adapter - should be handled upstream",
            400,
            { filename: document.getFilename() },
          ),
        );
      }

      const features = this.mapFeatures(config);
      const textractResponse = await this.startAndPollJob(
        document,
        features,
        costTracker,
      );

      if (isErr(textractResponse)) {
        return err(textractResponse.error);
      }

      return this.buildExtractionResult(
        document,
        textractResponse.value.blocks,
        textractResponse.value.metadata,
        costTracker,
        startTime,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        "Extraction failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          filename: document.getFilename(),
          errorMessage,
        },
      );

      return err(
        new ExternalServiceError(
          "TextractAdapter",
          `Extraction failed: ${errorMessage}`,
          500,
          { filename: document.getFilename(), error: errorMessage },
        ),
      );
    }
  }

  /**
   * Starts an extraction job and returns immediately with job ID.
   */
  async startExtractionJob(
    document: Document,
    config: ExtractionConfig,
  ): Promise<Result<string, ExternalServiceError>> {
    logger.info("Starting extraction job", {
      filename: document.getFilename(),
      type: document.getType().toString(),
      sizeMB: document.getSizeMB(),
    });

    if (document.isArchive()) {
      return err(
        new ExternalServiceError(
          "TextractAdapter",
          "Archive extraction not supported",
          400,
          { filename: document.getFilename() },
        ),
      );
    }

    const features = this.mapFeatures(config);
    const s3Location = {
      bucket: document.getS3Bucket(),
      key: document.getS3Path(),
    };

    const startJobResult = await this.textractClient.startDocumentAnalysis(
      s3Location,
      features,
    );

    if (isErr(startJobResult)) {
      return err(startJobResult.error);
    }

    const jobId = startJobResult.value;

    logger.info("Extraction job started", {
      jobId,
      filename: document.getFilename(),
    });

    return ok(jobId);
  }

  /**
   * Checks the status of an extraction job.
   */
  async getExtractionJobStatus(
    jobId: string,
  ): Promise<Result<ExtractionJobStatus, ExternalServiceError>> {
    const result = await this.textractClient.getDocumentAnalysis(jobId);

    if (isErr(result)) {
      return err(result.error);
    }

    const status = result.value.status;

    if (status === JobStatus.SUCCEEDED) {
      return ok("SUCCEEDED");
    } else if (status === JobStatus.FAILED) {
      return ok("FAILED");
    } else {
      return ok("IN_PROGRESS");
    }
  }

  /**
   * Gets the result of a completed extraction job.
   */
  async getExtractionJobResult(
    jobId: string,
    metadata: {
      document: Document;
      startTime: number;
    },
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>> {
    const result = await this.textractClient.getDocumentAnalysis(jobId);

    if (isErr(result)) {
      return err(result.error);
    }

    if (result.value.status !== JobStatus.SUCCEEDED) {
      return err(
        new ExternalServiceError(
          "TextractAdapter",
          `Job is not completed. Status: ${result.value.status}`,
          400,
          { jobId, status: result.value.status },
        ),
      );
    }

    if (!result.value.response) {
      return err(
        new ExternalServiceError(
          "TextractAdapter",
          "Job succeeded but no response data available",
          500,
          { jobId },
        ),
      );
    }

    const pageCount = result.value.response.metadata?.Pages || 1;
    const costTracker = new TextractCostTracker();
    costTracker.trackApiCall("AnalyzeDocument", pageCount);

    const extractionResult = await this.buildExtractionResult(
      metadata.document,
      result.value.response.blocks,
      result.value.response.metadata,
      costTracker,
      metadata.startTime,
    );

    return extractionResult;
  }

  /**
   * Starts async job and polls until completion (internal helper).
   */
  private async startAndPollJob(
    document: Document,
    features: FeatureType[],
    costTracker: TextractCostTracker,
  ): Promise<
    Result<
      { blocks: Block[]; metadata?: DocumentMetadata },
      ExternalServiceError
    >
  > {
    logger.info("Using asynchronous extraction", {
      filename: document.getFilename(),
      features,
    });

    const s3Location = {
      bucket: document.getS3Bucket(),
      key: document.getS3Path(),
    };

    const startJobResult = await this.textractClient.startDocumentAnalysis(
      s3Location,
      features,
    );

    if (isErr(startJobResult)) {
      return err(startJobResult.error);
    }

    const jobId = startJobResult.value;

    logger.info("Textract job started, polling for completion", { jobId });

    const pollResult = await this.textractClient.pollJobUntilComplete(
      jobId,
      2000,
      300000,
    );

    if (isErr(pollResult)) {
      const error = pollResult.error;
      if (error instanceof TimeoutError) {
        return err(
          new ExternalServiceError(
            "TextractAdapter",
            `Async extraction timed out: ${error.message}`,
            504,
            { jobId, timeout: error.timeout },
          ),
        );
      }
      return err(pollResult.error as ExternalServiceError);
    }

    const pageCount = pollResult.value.metadata?.Pages || 1;
    costTracker.trackApiCall("AnalyzeDocument", pageCount);

    return ok(pollResult.value);
  }

  /**
   * Builds extraction result from Textract blocks.
   */
  private async buildExtractionResult(
    document: Document,
    blocks: Block[],
    metadata: DocumentMetadata | undefined,
    costTracker: TextractCostTracker,
    startTime: number,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>> {
    const parseResult = this.parser.parse(blocks);

    if (isErr(parseResult)) {
      return err(
        new ExternalServiceError(
          "TextractAdapter",
          "Failed to parse Textract response",
          500,
          { error: parseResult.error },
        ),
      );
    }

    const { text, structuredData, confidence } = parseResult.value;

    const confidenceScoreResult = ConfidenceScore.create(confidence);
    if (isErr(confidenceScoreResult)) {
      return err(
        new ExternalServiceError(
          "TextractAdapter",
          "Invalid confidence score",
          500,
          { error: confidenceScoreResult.error },
        ),
      );
    }

    const processingTimeMs = Date.now() - startTime;

    const result: ExtractionResultDto = {
      attachmentId: document.getId().toString(),
      filename: document.getFilename(),
      extractedText: text,
      structuredData,
      metadata: {
        pageCount: metadata?.Pages || 1,
        confidence,
        language: "unknown",
        processingTimeMs,
      },
      cost: costTracker.getCurrentCost(),
    };

    logger.info("Extraction completed", {
      filename: document.getFilename(),
      textLength: text.length,
      confidence,
      processingTimeMs,
      cost: costTracker.getCurrentCost(),
    });

    return ok(result);
  }

  /**
   * Maps extraction config features to Textract feature types.
   */
  private mapFeatures(config: ExtractionConfig): FeatureType[] {
    const textractConfig = config.getTextractConfig();
    const features: FeatureType[] = [];

    for (const feature of textractConfig.features) {
      if (feature === "FORMS") {
        features.push(FeatureType.FORMS);
      } else if (feature === "TABLES") {
        features.push(FeatureType.TABLES);
      } else if (feature === "LAYOUT") {
        features.push(FeatureType.LAYOUT);
      }
    }

    return features;
  }
}
