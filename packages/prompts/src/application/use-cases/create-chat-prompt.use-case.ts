import { Result } from "../../shared/types/result.js";
import {
  FormatError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/domain.errors.js";
import { PromptRepository } from "../../domain/repositories/prompt.repository.js";
import {
  ChatMessage,
  ChatPromptConfig,
  ChatPromptResponse,
  CreateChatPromptParams,
  MessageRole,
  MessageSpec,
} from "../dto/chat-prompt.dto.js";
import { LanguageCode } from "../../domain/value-objects/language-code.value-object.js";
import { Logger } from "@the-project-b/logging";

/**
 * Use case for creating chat prompts with message sequences.
 * Supports prompt references, tag filtering, and message composition.
 */
export class CreateChatPromptUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly promptRepository: PromptRepository,
    logger?: Logger,
  ) {
    this.logger = logger || new Logger({ service: "prompts" });
  }

  // #region Main Execution
  /**
   * Creates a chat prompt from message specifications.
   * @param params - Parameters including messages and configuration
   * @returns Result<ChatPromptResponse, FormatError | NotFoundError | ValidationError> - Chat prompt with metadata or error
   */
  async execute(
    params: CreateChatPromptParams,
  ): Promise<
    Result<ChatPromptResponse, FormatError | NotFoundError | ValidationError>
  > {
    const config = params.config || {};
    const correlationId = config.correlationId || this.generateCorrelationId();

    this.logger.info("Creating chat prompt", {
      messageCount: params.messages.length,
      language: config.language?.toString(),
      correlationId,
      filterTags: config.filterTags,
      excludeTags: config.excludeTags,
    });

    const messages: ChatMessage[] = [];
    const promptsUsed: ChatPromptResponse["metadata"]["promptsUsed"] = [];
    const allTags = new Set<string>();

    for (const messageSpec of params.messages) {
      const messageResult = await this.processMessageSpec(
        messageSpec,
        config,
        correlationId,
      );

      if (Result.isFailure(messageResult)) {
        return messageResult;
      }

      const { message, promptMetadata } = Result.unwrap(messageResult);

      if (this.shouldIncludeMessage(message, config)) {
        messages.push(message);

        if (message.tags) {
          message.tags.forEach((tag) => allTags.add(tag));
        }

        if (promptMetadata) {
          promptsUsed.push(promptMetadata);
        }
      }
    }

    this.logger.info("Chat prompt created successfully", {
      correlationId,
      finalMessageCount: messages.length,
      promptsUsedCount: promptsUsed.length,
      totalTags: allTags.size,
    });

    const response: ChatPromptResponse = {
      messages,
      metadata: {
        messageCount: messages.length,
        language: (config.language || LanguageCode.getDefault()).toString(),
        tags: Array.from(allTags),
        timestamp: new Date(),
        correlationId,
        promptsUsed,
      },
    };

    return Result.success(response);
  }
  // #endregion

  // #region Message Processing
  /**
   * Processes a single message specification.
   * @param spec - The message specification
   * @param config - Chat prompt configuration
   * @param correlationId - Correlation ID for tracking
   * @returns Result<{message: ChatMessage, promptMetadata?: ...}, Error> - Processed message or error
   */
  private async processMessageSpec(
    spec: MessageSpec,
    config: ChatPromptConfig,
    correlationId: string,
  ): Promise<
    Result<
      {
        message: ChatMessage;
        promptMetadata?: {
          promptId: string;
          promptName: string;
          version: string;
        };
      },
      FormatError | NotFoundError | ValidationError
    >
  > {
    if (spec.type === "prompt") {
      return this.formatPromptMessage(spec, config, correlationId);
    }

    const message: ChatMessage = {
      role: this.mapTypeToRole(spec.type),
      content: spec.content,
      tags: spec.tags,
    };

    return Result.success({ message });
  }

  /**
   * Formats a prompt-based message.
   * @param spec - The prompt message specification
   * @param config - Chat prompt configuration
   * @param correlationId - Correlation ID for tracking
   * @returns Result<{message: ChatMessage, promptMetadata: ...}, Error> - Formatted message or error
   */
  private async formatPromptMessage(
    spec: Extract<MessageSpec, { type: "prompt" }>,
    config: ChatPromptConfig,
    correlationId: string,
  ): Promise<
    Result<
      {
        message: ChatMessage;
        promptMetadata: {
          promptId: string;
          promptName: string;
          version: string;
        };
      },
      FormatError | NotFoundError
    >
  > {
    this.logger.debug("Formatting prompt message", {
      promptName: spec.promptName,
      role: spec.role,
      correlationId,
    });

    const promptResult = await this.promptRepository.findByName(
      spec.promptName,
    );
    if (Result.isFailure(promptResult)) {
      const error = Result.unwrapFailure(promptResult);
      this.logger.error("Failed to find prompt for message", {
        promptName: spec.promptName,
        correlationId,
        error: error.message,
      });
      return Result.failure(error);
    }

    const prompt = Result.unwrap(promptResult);
    const language = config.language || LanguageCode.getDefault();

    const formattedResult = prompt.format(spec.variables || {}, language);
    if (Result.isFailure(formattedResult)) {
      const error = Result.unwrapFailure(formattedResult);
      this.logger.error("Failed to format prompt for message", {
        promptName: spec.promptName,
        correlationId,
        error: error.message,
      });
      return Result.failure(error);
    }

    const formatted = Result.unwrap(formattedResult);

    const message: ChatMessage = {
      role: spec.role,
      content: formatted.content,
      tags: [...(spec.tags || []), ...formatted.metadata.tags],
    };

    const promptMetadata = {
      promptId: formatted.metadata.promptId,
      promptName: formatted.metadata.promptName,
      version: formatted.metadata.version,
    };

    return Result.success({ message, promptMetadata });
  }
  // #endregion

  // #region Message Filtering
  /**
   * Determines if a message should be included based on tag filters.
   * @param message - The message to check
   * @param config - Chat prompt configuration with filters
   * @returns boolean - True if message should be included
   */
  private shouldIncludeMessage(
    message: ChatMessage,
    config: ChatPromptConfig,
  ): boolean {
    if (!message.tags || message.tags.length === 0) {
      return true;
    }

    if (config.excludeTags && config.excludeTags.length > 0) {
      const hasExcludedTag = message.tags.some((tag) =>
        config.excludeTags?.includes(tag),
      );
      if (hasExcludedTag) {
        this.logger.debug("Message excluded by tag filter", {
          tags: message.tags,
          excludeTags: config.excludeTags,
        });
        return false;
      }
    }

    if (config.filterTags && config.filterTags.length > 0) {
      const hasRequiredTag = message.tags.some((tag) =>
        config.filterTags?.includes(tag),
      );
      if (!hasRequiredTag) {
        this.logger.debug("Message excluded - missing required tags", {
          tags: message.tags,
          filterTags: config.filterTags,
        });
        return false;
      }
    }

    return true;
  }
  // #endregion

  // #region Helper Methods
  /**
   * Maps message type to role.
   * @param type - The message type
   * @returns MessageRole - The corresponding role
   */
  private mapTypeToRole(
    type: "system" | "human" | "ai" | "assistant",
  ): MessageRole {
    return type === "ai" ? "assistant" : type;
  }

  /**
   * Generates a unique correlation ID for request tracking.
   * @returns string - UUID-like correlation ID
   */
  private generateCorrelationId(): string {
    return `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  // #endregion
}
