import { Result } from "../../shared/types/result.js";
import {
  FormatError,
  NotFoundError,
} from "../../shared/errors/domain.errors.js";
import { PromptRepository } from "../../domain/repositories/prompt.repository.js";
import {
  FormatSimplePromptParams,
  FormattedPromptResponse,
  FormatWithTruncationParams,
} from "../dto/format-prompt.dto.js";
import { LanguageCode } from "../../domain/value-objects/language-code.value-object.js";
import { FormattedPrompt } from "../../domain/entities/prompt.entity.js";
import { Logger } from "@the-project-b/logging";

/**
 * Use case for formatting simple prompts with variables.
 * Handles prompt retrieval, formatting, and metadata tracking.
 */
export class FormatSimplePromptUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly promptRepository: PromptRepository,
    logger?: Logger,
  ) {
    this.logger = logger || new Logger({ service: "prompts" });
  }

  // #region Main Execution
  /**
   * Formats a prompt with provided variables.
   * @param params - Parameters including prompt name and variables
   * @returns Result<FormattedPromptResponse, FormatError | NotFoundError> - Formatted prompt with metadata or error
   */
  async execute(
    params: FormatSimplePromptParams,
  ): Promise<Result<FormattedPromptResponse, FormatError | NotFoundError>> {
    const correlationId = params.correlationId || this.generateCorrelationId();

    this.logger.info("Formatting simple prompt", {
      promptName: params.promptName,
      language: params.language?.toString(),
      correlationId,
      variableCount: Object.keys(params.variables || {}).length,
    });

    const promptResult = await this.promptRepository.findByName(
      params.promptName,
    );
    if (Result.isFailure(promptResult)) {
      const error = Result.unwrapFailure(promptResult);
      this.logger.error("Prompt not found", {
        promptName: params.promptName,
        correlationId,
        error: error.message,
      });
      return Result.failure(error);
    }

    const prompt = Result.unwrap(promptResult);
    const language = params.language || LanguageCode.getDefault();

    const formattedResult = prompt.format(params.variables || {}, language);

    if (Result.isFailure(formattedResult)) {
      const error = Result.unwrapFailure(formattedResult);
      this.logger.error("Failed to format prompt", {
        promptName: params.promptName,
        correlationId,
        error: error.message,
      });
      return Result.failure(error);
    }

    const formatted = Result.unwrap(formattedResult);

    this.logger.info("Prompt formatted successfully", {
      promptName: params.promptName,
      correlationId,
      contentLength: formatted.content.length,
      languageUsed: formatted.metadata.languageUsed,
    });

    const response = this.mapToResponse(formatted, correlationId);
    return Result.success(response);
  }

  /**
   * Formats a prompt with truncation for token limits.
   * @param params - Parameters including prompt name, variables, and max length
   * @returns Result<FormattedPromptResponse, FormatError | NotFoundError> - Formatted prompt with truncation metadata
   */
  async executeWithTruncation(
    params: FormatWithTruncationParams,
  ): Promise<Result<FormattedPromptResponse, FormatError | NotFoundError>> {
    const correlationId = params.correlationId || this.generateCorrelationId();
    const maxLength = params.maxLength || 2500;

    this.logger.debug("Formatting prompt with truncation", {
      promptName: params.promptName,
      maxLength,
      correlationId,
    });

    const promptResult = await this.promptRepository.findByName(
      params.promptName,
    );
    if (Result.isFailure(promptResult)) {
      const error = Result.unwrapFailure(promptResult);
      this.logger.error("Prompt not found for truncation", {
        promptName: params.promptName,
        correlationId,
        error: error.message,
      });
      return Result.failure(error);
    }

    const prompt = Result.unwrap(promptResult);
    const language = params.language || LanguageCode.getDefault();

    const formattedResult = prompt.formatWithTruncation(
      params.variables || {},
      language,
      maxLength,
    );

    if (Result.isFailure(formattedResult)) {
      const error = Result.unwrapFailure(formattedResult);
      this.logger.error("Failed to format prompt with truncation", {
        promptName: params.promptName,
        correlationId,
        error: error.message,
      });
      return Result.failure(error);
    }

    const formatted = Result.unwrap(formattedResult);

    if (
      formatted.metadata.truncations &&
      formatted.metadata.truncations.length > 0
    ) {
      this.logger.info("Content was truncated", {
        promptName: params.promptName,
        correlationId,
        truncations: formatted.metadata.truncations,
      });
    }

    const response = this.mapToResponse(formatted, correlationId);
    return Result.success(response);
  }
  // #endregion

  // #region Helper Methods
  /**
   * Maps domain FormattedPrompt to response DTO.
   * @param formatted - The formatted prompt from domain
   * @param correlationId - The correlation ID for tracking
   * @returns FormattedPromptResponse - Response DTO with metadata
   */
  private mapToResponse(
    formatted: FormattedPrompt,
    correlationId?: string,
  ): FormattedPromptResponse {
    return {
      content: formatted.content,
      metadata: {
        ...formatted.metadata,
        correlationId,
      },
    };
  }

  /**
   * Generates a unique correlation ID for request tracking.
   * @returns string - UUID-like correlation ID
   */
  private generateCorrelationId(): string {
    return `prompt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  // #endregion
}
