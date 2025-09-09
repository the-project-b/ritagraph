import { Result } from "../../shared/types/result.js";
import {
  NotFoundError,
  PersistenceError,
  FormatError,
} from "../../shared/errors/domain.errors.js";
import { PromptRepository } from "../../domain/repositories/prompt.repository.js";
import { Prompt } from "../../domain/entities/prompt.entity.js";
import { PromptId } from "../../domain/value-objects/prompt-id.value-object.js";
import { LanguageCode } from "../../domain/value-objects/language-code.value-object.js";
import { PromptCategory } from "../../domain/value-objects/prompt-metadata.value-object.js";
import { PromptVariables } from "../../domain/value-objects/prompt-variables.value-object.js";
import { CreateChatPromptUseCase } from "../use-cases/create-chat-prompt.use-case.js";
import type { FormattedPromptResponse } from "../dto/format-prompt.dto.js";
import type {
  CreateChatPromptParams,
  ChatPromptResponse,
} from "../dto/chat-prompt.dto.js";
import type { Logger } from "@the-project-b/logging";

/**
 * Available repository sources for prompts.
 */
export type PromptSource = "memory" | "langsmith" | string;

/**
 * Configuration for the PromptService.
 */
export interface PromptServiceConfig {
  repositories: Record<PromptSource, PromptRepository>;
  defaultSource?: PromptSource;
  logger?: Logger;
}

/**
 * Parameters for formatting a prompt.
 */
export interface FormatPromptParams {
  promptName: string;
  source?: PromptSource;
  variables?: Record<string, unknown>;
  language?: string;
  maxLength?: number;
  correlationId?: string;
}

/**
 * Parameters for registering a prompt.
 */
export interface RegisterPromptParams {
  id?: string;
  name: string;
  templates: Map<string, string> | { [key: string]: string };
  category?: PromptCategory;
  variables?: PromptVariables;
  metadata?: {
    version?: string;
    tags?: string[];
    owner?: string;
    description?: string;
  };
  source?: PromptSource;
}

/**
 * Service for managing prompts across multiple repositories.
 * Provides a unified interface for prompt operations with source selection.
 */
export class PromptService {
  private readonly repositories: Map<PromptSource, PromptRepository>;
  private readonly defaultSource: PromptSource;
  private readonly createChatPromptUseCase: CreateChatPromptUseCase;
  private readonly logger?: Logger;

  constructor(config: PromptServiceConfig) {
    this.repositories = new Map(Object.entries(config.repositories));
    this.defaultSource = config.defaultSource || "memory";
    this.logger = config.logger;

    if (!this.repositories.has(this.defaultSource)) {
      throw new Error(
        `Default source '${this.defaultSource}' not found in repositories`,
      );
    }

    // Initialize use case with the default repository
    const defaultRepo = this.repositories.get(this.defaultSource)!;
    this.createChatPromptUseCase = new CreateChatPromptUseCase(
      defaultRepo,
      config.logger,
    );

    config.logger?.info("PromptService initialized", {
      sources: Array.from(this.repositories.keys()),
      defaultSource: this.defaultSource,
    });
  }

  /**
   * Gets a repository by source name.
   * @param source - The source to get
   * @returns Result<PromptRepository, NotFoundError>
   */
  private getRepository(
    source?: PromptSource,
  ): Result<PromptRepository, NotFoundError> {
    const targetSource = source || this.defaultSource;
    const repository = this.repositories.get(targetSource);

    if (!repository) {
      return Result.failure(new NotFoundError("Repository", targetSource));
    }

    return Result.success(repository);
  }

  /**
   * Formats a prompt with variables from the specified source.
   * @param params - Formatting parameters
   * @returns Promise<Result<FormattedPromptResponse, FormatError | NotFoundError>>
   */
  async formatPrompt(
    params: FormatPromptParams,
  ): Promise<Result<FormattedPromptResponse, FormatError | NotFoundError>> {
    this.logger?.debug("Formatting prompt", {
      promptName: params.promptName,
      source: params.source || this.defaultSource,
    });

    const repoResult = this.getRepository(params.source);
    if (Result.isFailure(repoResult)) {
      return Result.failure(Result.unwrapFailure(repoResult));
    }

    const repository = Result.unwrap(repoResult);

    // Find the prompt by name
    const promptResult = await repository.findByName(params.promptName);
    if (Result.isFailure(promptResult)) {
      return Result.failure(Result.unwrapFailure(promptResult));
    }

    const prompt = Result.unwrap(promptResult);

    // Format the prompt with variables
    const language = params.language
      ? LanguageCode.fromString(params.language)
      : Result.success(LanguageCode.getDefault());

    if (Result.isFailure(language)) {
      return Result.failure(
        new FormatError(`Invalid language: ${params.language}`),
      );
    }

    const formatResult = params.maxLength
      ? prompt.formatWithTruncation(
          params.variables || {},
          Result.unwrap(language),
          params.maxLength,
        )
      : prompt.format(params.variables || {}, Result.unwrap(language));

    if (Result.isFailure(formatResult)) {
      return Result.failure(Result.unwrapFailure(formatResult));
    }

    const formatted = Result.unwrap(formatResult);

    // Create extended response with additional metadata
    const response: FormattedPromptResponse = {
      ...formatted,
      metadata: {
        ...formatted.metadata,
        correlationId: params.correlationId,
        source: params.source || this.defaultSource,
      },
    };

    return Result.success(response);
  }

  /**
   * Creates a chat prompt from messages.
   * @param params - Chat prompt parameters
   * @returns Promise<Result<ChatPromptResponse, FormatError>>
   */
  async createChatPrompt(
    params: CreateChatPromptParams,
  ): Promise<Result<ChatPromptResponse, FormatError>> {
    return this.createChatPromptUseCase.execute(params);
  }

  /**
   * Registers a new prompt in the specified repository.
   * @param params - Registration parameters
   * @returns Promise<Result<void, PersistenceError | NotFoundError>>
   */
  async registerPrompt(
    params: RegisterPromptParams,
  ): Promise<Result<void, PersistenceError | NotFoundError>> {
    const repoResult = this.getRepository(params.source);
    if (Result.isFailure(repoResult)) {
      return Result.failure(Result.unwrapFailure(repoResult));
    }

    const repository = Result.unwrap(repoResult);

    // Create the prompt entity
    const promptResult = Prompt.create({
      id: params.id || `${params.name}-${Date.now()}`,
      name: params.name,
      category: params.category,
      templates: params.templates,
      variables: params.variables,
      metadata: params.metadata,
    });

    if (Result.isFailure(promptResult)) {
      return Result.failure(
        new PersistenceError(
          `Failed to create prompt: ${Result.unwrapFailure(promptResult).message}`,
        ),
      );
    }

    const prompt = Result.unwrap(promptResult);
    return repository.save(prompt);
  }

  /**
   * Gets a prompt by ID from the specified source.
   * @param id - The prompt ID
   * @param source - The source to query
   * @returns Promise<Result<Prompt, NotFoundError>>
   */
  async getPrompt(
    id: string,
    source?: PromptSource,
  ): Promise<Result<Prompt, NotFoundError>> {
    const repoResult = this.getRepository(source);
    if (Result.isFailure(repoResult)) {
      return Result.failure(Result.unwrapFailure(repoResult));
    }

    const repository = Result.unwrap(repoResult);
    const promptIdResult = PromptId.create(id);
    if (Result.isFailure(promptIdResult)) {
      return Result.failure(new NotFoundError("Prompt", id));
    }

    return repository.findById(Result.unwrap(promptIdResult));
  }

  /**
   * Gets a prompt by name from the specified source.
   * @param name - The prompt name
   * @param source - The source to query
   * @returns Promise<Result<Prompt, NotFoundError>>
   */
  async getPromptByName(
    name: string,
    source?: PromptSource,
  ): Promise<Result<Prompt, NotFoundError>> {
    const repoResult = this.getRepository(source);
    if (Result.isFailure(repoResult)) {
      return Result.failure(Result.unwrapFailure(repoResult));
    }

    const repository = Result.unwrap(repoResult);
    return repository.findByName(name);
  }

  /**
   * Lists all available sources.
   * @returns string[] - Array of source names
   */
  listSources(): string[] {
    return Array.from(this.repositories.keys());
  }

  /**
   * Gets the default source.
   * @returns string - The default source name
   */
  getDefaultSource(): string {
    return this.defaultSource;
  }
}
