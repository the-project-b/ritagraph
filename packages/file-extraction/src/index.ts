export * from "./domain/entities/ExtractionJob.entity.js";
export * from "./domain/entities/ExtractionResult.entity.js";
export * from "./domain/entities/Document.entity.js";

export * from "./domain/value-objects/AttachmentId.value-object.js";
export * from "./domain/value-objects/ExtractionStatus.value-object.js";
export * from "./domain/value-objects/ConfidenceScore.value-object.js";
export * from "./domain/value-objects/DocumentType.value-object.js";
export * from "./domain/value-objects/ExtractionConfig.value-object.js";

export * from "./domain/repositories/AttachmentRepository.js";
export * from "./domain/repositories/DocumentStorageRepository.js";
export * from "./domain/repositories/ExtractionResultRepository.js";

export * from "./domain/services/ExtractionOrchestrator.service.js";

export * from "./application/dto/ExtractAttachments.dto.js";
export * from "./application/dto/ExtractionResult.dto.js";
export * from "./application/dto/ExtractionConfig.dto.js";

export { ExtractAttachmentsUseCase } from "./application/use-cases/ExtractAttachments.use-case.js";
export * from "./application/use-cases/ValidateExtractionQuality.use-case.js";

export * from "./infrastructure/adapters/ExtractionAdapter.interface.js";
export * from "./infrastructure/adapters/TextractAdapter.js";
export * from "./infrastructure/adapters/MockAdapter.js";

export * from "./infrastructure/clients/S3Client.js";
export * from "./infrastructure/clients/TextractClient.js";

export * from "./infrastructure/factories/ExtractionAdapterFactory.js";
export * from "./infrastructure/factories/FormatterFactory.js";

export * from "./shared/errors/TextractServiceError.js";
