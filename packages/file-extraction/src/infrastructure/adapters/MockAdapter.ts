/* eslint-disable unused-imports/no-unused-vars */
// ^ We don't give a shit about unused vars, this is a mock

import { Result, ok, ExternalServiceError } from "@the-project-b/types";
import {
  ExtractionAdapter,
  ExtractionJobStatus,
} from "./ExtractionAdapter.interface.js";
import { Document } from "../../domain/entities/Document.entity.js";
import { ExtractionConfig } from "../../domain/value-objects/ExtractionConfig.value-object.js";
import { ExtractionResultDto } from "../../application/dto/ExtractionResult.dto.js";

/**
 * Mock adapter for testing purposes.
 * Returns fake extraction results without calling external services.
 */
export class MockAdapter implements ExtractionAdapter {
  getProviderName(): string {
    return "Mock";
  }

  async extractText(
    document: Document,
    config: ExtractionConfig,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>> {
    const result: ExtractionResultDto = {
      attachmentId: document.getId().toString(),
      filename: document.getFilename(),
      extractedText: `Mock extracted text from ${document.getFilename()}`,
      structuredData: {
        tables: [],
        forms: [],
        layout: [],
      },
      metadata: {
        pageCount: 1,
        confidence: 0.95,
        language: "EN",
        processingTimeMs: 100,
      },
      cost: {
        pages: 1,
        apiCalls: 1,
        estimatedCostUSD: 0.05,
      },
    };

    return ok(result);
  }

  async startExtractionJob(
    document: Document,
    config: ExtractionConfig,
  ): Promise<Result<string, ExternalServiceError>> {
    const jobId = `mock-job-${Date.now()}`;
    return ok(jobId);
  }

  async getExtractionJobStatus(
    jobId: string,
  ): Promise<Result<ExtractionJobStatus, ExternalServiceError>> {
    return ok("SUCCEEDED");
  }

  async getExtractionJobResult(
    jobId: string,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>> {
    const result: ExtractionResultDto = {
      attachmentId: "mock-attachment-id",
      filename: "mock-document.pdf",
      extractedText: "Mock extracted text from job result",
      structuredData: {
        tables: [],
        forms: [],
        layout: [],
      },
      metadata: {
        pageCount: 1,
        confidence: 0.95,
        language: "EN",
        processingTimeMs: 100,
      },
      cost: {
        pages: 1,
        apiCalls: 1,
        estimatedCostUSD: 0.05,
      },
    };

    return ok(result);
  }
}
