import {
  Result,
  ok,
  err,
  isOk,
  isErr,
  ExternalServiceError,
} from "@the-project-b/types";
import { createLogger } from "@the-project-b/logging";
import { DocumentStorageRepository } from "../../domain/repositories/DocumentStorageRepository.js";
import { GraphQLAttachmentRepository } from "../../infrastructure/repositories/GraphQLAttachmentRepository.js";
import { AttachmentId } from "../../domain/value-objects/AttachmentId.value-object.js";
import { ExtractionConfig } from "../../domain/value-objects/ExtractionConfig.value-object.js";
import { Document } from "../../domain/entities/Document.entity.js";
import { DocumentType } from "../../domain/value-objects/DocumentType.value-object.js";
import {
  ExtractAttachmentsDto,
  ExtractAttachmentsConfigDto,
} from "../dto/ExtractAttachments.dto.js";
import { ExtractionResultDto } from "../dto/ExtractionResult.dto.js";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "ExtractAttachmentsUseCase",
});

export interface ExtractionAdapter {
  extractText(
    document: Document,
    config: ExtractionConfig,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>>;
}

/**
 * Use case for extracting text from attachments.
 * Orchestrates the complete extraction workflow including retry logic.
 */
export class ExtractAttachmentsUseCase {
  constructor(
    private readonly graphqlEndpoint: string,
    private readonly documentStorageRepository: DocumentStorageRepository,
    private readonly extractionAdapter: ExtractionAdapter,
  ) {}

  /**
   * Executes the extraction workflow for multiple attachments.
   */
  async execute(
    dto: ExtractAttachmentsDto,
  ): Promise<Result<ExtractionResultDto[], ExternalServiceError>> {
    logger.info("Starting extraction workflow", {
      attachmentCount: dto.attachmentIds.length,
      companyId: dto.companyId,
      userId: dto.userId,
    });

    // Create attachment repository with user's auth token
    const attachmentRepository = new GraphQLAttachmentRepository(
      this.graphqlEndpoint,
      dto.authToken,
    );

    const configResult = this.buildConfig(dto.config);
    if (isErr(configResult)) {
      return err(
        new ExternalServiceError(
          "Configuration",
          "Invalid extraction configuration",
          400,
          { error: configResult.error },
        ),
      );
    }
    const config = configResult.value;

    const attachmentIdsResult = dto.attachmentIds.map((id) =>
      AttachmentId.create(id),
    );
    const failedIds = attachmentIdsResult.filter((r) => isErr(r));
    if (failedIds.length > 0) {
      return err(
        new ExternalServiceError("Validation", "Invalid attachment IDs", 400, {
          errors: failedIds
            .map((r) => (isErr(r) ? r.error : null))
            .filter((e) => e !== null),
        }),
      );
    }

    const attachmentIds = attachmentIdsResult
      .filter((r) => isOk(r))
      .map((r) => r.value);

    const attachmentsResult =
      await attachmentRepository.findByIds(attachmentIds);
    if (isErr(attachmentsResult)) {
      return err(
        new ExternalServiceError(
          "AttachmentRepository",
          "Failed to fetch attachments",
          500,
          { error: attachmentsResult.error },
        ),
      );
    }

    const attachments = attachmentsResult.value;

    const documentsResult = await this.prepareDocuments(attachments);
    if (isErr(documentsResult)) {
      return err(documentsResult.error);
    }
    const documents = documentsResult.value;

    const results: ExtractionResultDto[] = [];
    const failures: Array<{ attachmentId: string; error: string }> = [];

    for (const document of documents) {
      logger.info("Processing document", {
        filename: document.getFilename(),
        type: document.getType().toString(),
        sizeMB: document.getSizeMB(),
      });

      const extractionResult = await this.extractWithRetry(document, config);

      if (isOk(extractionResult)) {
        results.push(extractionResult.value);
        logger.info("Document extraction successful", {
          filename: document.getFilename(),
          confidence: extractionResult.value.metadata.confidence,
        });
      } else {
        failures.push({
          attachmentId: document.getId().toString(),
          error: extractionResult.error.message,
        });
        logger.error("Document extraction failed", extractionResult.error, {
          filename: document.getFilename(),
        });
      }
    }

    if (results.length === 0) {
      return err(
        new ExternalServiceError("Extraction", "All extractions failed", 500, {
          failures,
        }),
      );
    }

    logger.info("Extraction workflow completed", {
      successCount: results.length,
      failureCount: failures.length,
    });

    return ok(results);
  }

  /**
   * Builds extraction config from partial DTO.
   */
  private buildConfig(
    partialConfig?: Partial<ExtractAttachmentsConfigDto>,
  ): Result<ExtractionConfig, ExternalServiceError> {
    const configResult = ExtractionConfig.create(partialConfig || {});

    if (isErr(configResult)) {
      return err(
        new ExternalServiceError(
          "Configuration",
          "Invalid configuration",
          400,
          { error: configResult.error },
        ),
      );
    }

    return ok(configResult.value);
  }

  /**
   * Prepares Document entities from attachment metadata.
   */
  private async prepareDocuments(
    attachments: Array<{
      id: AttachmentId;
      filename: string;
      fileSize: number;
      s3Path: string;
      s3Bucket: string;
      mimeType?: string;
    }>,
  ): Promise<Result<Document[], ExternalServiceError>> {
    const documents: Document[] = [];

    for (const attachment of attachments) {
      const typeResult = attachment.mimeType
        ? DocumentType.fromMimeType(attachment.mimeType)
        : DocumentType.fromFilename(attachment.filename);

      if (isErr(typeResult)) {
        return err(
          new ExternalServiceError(
            "DocumentType",
            `Unsupported file type for ${attachment.filename}`,
            400,
            { error: typeResult.error },
          ),
        );
      }

      const documentResult = Document.create({
        id: attachment.id,
        filename: attachment.filename,
        type: typeResult.value,
        sizeBytes: attachment.fileSize,
        s3Path: attachment.s3Path,
        s3Bucket: attachment.s3Bucket,
      });

      if (isErr(documentResult)) {
        return err(
          new ExternalServiceError(
            "Document",
            "Failed to create document entity",
            500,
            { error: documentResult.error },
          ),
        );
      }

      const document = documentResult.value;

      if (!document.isProcessable()) {
        return err(
          new ExternalServiceError(
            "Document",
            `Document type not processable: ${attachment.filename}`,
            400,
            { type: document.getType().toString() },
          ),
        );
      }

      documents.push(document);
    }

    return ok(documents);
  }

  /**
   * Extracts text with retry logic.
   */
  private async extractWithRetry(
    document: Document,
    config: ExtractionConfig,
  ): Promise<Result<ExtractionResultDto, ExternalServiceError>> {
    const retryConfig = config.getRetryConfig();
    let lastError: ExternalServiceError | null = null;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      logger.info("Extraction attempt", {
        filename: document.getFilename(),
        attempt,
        maxAttempts: retryConfig.maxAttempts,
      });

      const result = await this.extractionAdapter.extractText(document, config);

      if (isOk(result)) {
        return result;
      }

      lastError = result.error;

      if (attempt < retryConfig.maxAttempts) {
        const backoffMs =
          retryConfig.backoffMs *
          Math.pow(retryConfig.backoffMultiplier, attempt - 1);
        logger.warn("Extraction failed, retrying", {
          filename: document.getFilename(),
          attempt,
          backoffMs,
          error: result.error.message,
        });

        await this.sleep(backoffMs);
      }
    }

    return err(
      lastError ||
        new ExternalServiceError(
          "Extraction",
          "Extraction failed after all retry attempts",
          500,
          { filename: document.getFilename() },
        ),
    );
  }

  /**
   * Sleep utility for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
