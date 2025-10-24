import { Result, ExternalServiceError } from "@the-project-b/types";
import { Document } from "../../domain/entities/Document.entity.js";
import { ExtractionConfig } from "../../domain/value-objects/ExtractionConfig.value-object.js";
import { ExtractionResultDto } from "../../application/dto/ExtractionResult.dto.js";

export type ExtractionJobStatus = "IN_PROGRESS" | "SUCCEEDED" | "FAILED";

/**
 * Interface for extraction adapters.
 * Allows pluggable extraction services (Textract, Google Document AI, etc.).
 * Supports both blocking and non-blocking (job-based) extraction patterns.
 */
export interface ExtractionAdapter {
  /**
   * Extracts text and structured data from a document (blocking).
   * Internally manages async job polling and returns final result.
   * Use this for simple workflows and CLI tools.
   */
  extractText(
    document: Document,
    config: ExtractionConfig,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>>;

  /**
   * Starts an extraction job and returns immediately with job ID.
   * Use this for graph-based workflows that need to poll status separately.
   */
  startExtractionJob(
    document: Document,
    config: ExtractionConfig,
  ): Promise<Result<string, ExternalServiceError>>;

  /**
   * Checks the status of an extraction job.
   */
  getExtractionJobStatus(
    jobId: string,
  ): Promise<Result<ExtractionJobStatus, ExternalServiceError>>;

  /**
   * Gets the result of a completed extraction job.
   * Only call this after status returns SUCCEEDED.
   */
  getExtractionJobResult(
    jobId: string,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>>;

  /**
   * Returns the name of the extraction provider.
   */
  getProviderName(): string;
}
