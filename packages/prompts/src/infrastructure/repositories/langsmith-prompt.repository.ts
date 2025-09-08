import { Result } from "../../shared/types/result.js";
import {
  NotFoundError,
  PersistenceError,
} from "../../shared/errors/domain.errors.js";
import {
  PromptRepository,
  PromptFilter,
} from "../../domain/repositories/prompt.repository.js";
import {
  Prompt,
  CreatePromptParams,
} from "../../domain/entities/prompt.entity.js";
import { PromptId } from "../../domain/value-objects/prompt-id.value-object.js";
import { PromptCategory } from "../../domain/value-objects/prompt-metadata.value-object.js";
import { LanguageCode } from "../../domain/value-objects/language-code.value-object.js";
import {
  PromptVariables,
  VariableDefinition,
} from "../../domain/value-objects/prompt-variables.value-object.js";
import type {
  LangSmithClient,
  LangSmithPrompt,
} from "../clients/langsmith-client.types.js";
import type { Logger } from "@the-project-b/logging";

/**
 * Repository implementation for LangSmith prompt storage.
 * Adapts LangSmith API to domain repository interface.
 */
export class LangSmithPromptRepository implements PromptRepository {
  constructor(
    private readonly client: LangSmithClient,
    private readonly logger?: Logger,
  ) {}

  /**
   * Converts a LangSmith prompt to domain Prompt entity.
   * @param langsmithPrompt - The LangSmith prompt data
   * @returns Result<Prompt, PersistenceError>
   */
  private convertToDomainPrompt(
    langsmithPrompt: LangSmithPrompt,
  ): Result<Prompt, PersistenceError> {
    try {
      // Log the incoming LangSmith prompt structure
      this.logger?.info("Converting LangSmith prompt to domain", {
        id: langsmithPrompt.id,
        name: langsmithPrompt.name,
        templateType: typeof langsmithPrompt.template,
        isArray: Array.isArray(langsmithPrompt.template),
        template: langsmithPrompt.template,
        input_variables: langsmithPrompt.input_variables,
        metadata: langsmithPrompt.metadata,
      });

      // Extract template based on type
      let templateContent: string;
      let variables: PromptVariables;

      if (typeof langsmithPrompt.template === "string") {
        templateContent = langsmithPrompt.template;
      } else if (Array.isArray(langsmithPrompt.template)) {
        // For chat prompts, use the system message or concatenate all
        const systemMessage = langsmithPrompt.template.find(
          (msg) => msg.role === "system",
        );
        templateContent =
          systemMessage?.content ||
          langsmithPrompt.template.map((msg) => msg.content).join("\n");
      } else {
        templateContent = JSON.stringify(langsmithPrompt.template);
      }

      // Extract variables from input_variables if available
      if (
        langsmithPrompt.input_variables &&
        langsmithPrompt.input_variables.length > 0
      ) {
        const variableDefinitions: VariableDefinition[] = [];

        for (const varName of langsmithPrompt.input_variables) {
          variableDefinitions.push({
            name: varName,
            type: "string",
            required: true,
            description: `Variable ${varName} from LangSmith prompt`,
          });
        }

        const variablesResult = PromptVariables.create(variableDefinitions);
        if (Result.isFailure(variablesResult)) {
          throw new Error(
            `Failed to create variables: ${Result.unwrapFailure(variablesResult).message}`,
          );
        }
        variables = Result.unwrap(variablesResult);
      } else {
        variables = PromptVariables.empty();
      }

      // Create prompt params
      const createParams: CreatePromptParams = {
        id: langsmithPrompt.id,
        name: langsmithPrompt.name,
        category: PromptCategory.SYSTEM, // Use SYSTEM category for LangSmith prompts
        templates: {
          [LanguageCode.getDefault().toString()]: templateContent,
        },
        variables,
        metadata: {
          version: langsmithPrompt.metadata?.version || "1.0.0",
          tags: langsmithPrompt.metadata?.tags || [],
          description: langsmithPrompt.description,
        },
      };

      this.logger?.info("Creating domain prompt with params", {
        id: createParams.id,
        name: createParams.name,
        category: createParams.category,
        templatesKeys: Object.keys(createParams.templates),
        hasVariables: !!createParams.variables,
        metadata: createParams.metadata,
      });

      const promptResult = Prompt.create(createParams);

      if (Result.isFailure(promptResult)) {
        const error = Result.unwrapFailure(promptResult);
        this.logger?.error("Failed to create domain prompt", {
          error: error.message,
          errorType: error.constructor.name,
          errorDetails: error,
        });
        return Result.failure(
          new PersistenceError(
            `Failed to convert LangSmith prompt: ${error.message}`,
          ),
        );
      }

      this.logger?.debug("Successfully converted LangSmith prompt to domain", {
        promptName: langsmithPrompt.name,
      });

      return Result.success(Result.unwrap(promptResult));
    } catch (error) {
      this.logger?.error("Failed to convert LangSmith prompt", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return Result.failure(
        new PersistenceError(
          `Failed to convert LangSmith prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  /**
   * Finds a prompt by its unique identifier.
   * @param id - The prompt ID to search for
   * @returns Promise<Result<Prompt, NotFoundError>>
   */
  async findById(id: PromptId): Promise<Result<Prompt, NotFoundError>> {
    const promptResult = await this.client.pullPrompt(id.toString());

    if (Result.isFailure(promptResult)) {
      return Result.failure(new NotFoundError("Prompt", id.toString()));
    }

    const langsmithPrompt = Result.unwrap(promptResult);
    const domainPromptResult = this.convertToDomainPrompt(langsmithPrompt);

    if (Result.isFailure(domainPromptResult)) {
      return Result.failure(new NotFoundError("Prompt", id.toString()));
    }

    return Result.success(Result.unwrap(domainPromptResult));
  }

  /**
   * Finds a prompt by its name.
   * @param name - The prompt name to search for
   * @returns Promise<Result<Prompt, NotFoundError>>
   */
  async findByName(name: string): Promise<Result<Prompt, NotFoundError>> {
    const promptResult = await this.client.pullPrompt(name);

    if (Result.isFailure(promptResult)) {
      this.logger?.error("Failed to fetch prompt from LangSmith", {
        name,
        error: Result.unwrapFailure(promptResult),
      });
      return Result.failure(new NotFoundError("Prompt", name));
    }

    const langsmithPrompt = Result.unwrap(promptResult);
    const domainPromptResult = this.convertToDomainPrompt(langsmithPrompt);

    if (Result.isFailure(domainPromptResult)) {
      this.logger?.error("Failed to convert LangSmith prompt to domain", {
        name,
        error: Result.unwrapFailure(domainPromptResult),
      });
      return Result.failure(new NotFoundError("Prompt", name));
    }

    return Result.success(Result.unwrap(domainPromptResult));
  }

  /**
   * Gets the latest version of a prompt.
   * @param name - The prompt name
   * @returns Promise<Result<Prompt, NotFoundError>>
   */
  async getLatestVersion(name: string): Promise<Result<Prompt, NotFoundError>> {
    return this.findByName(name);
  }

  /**
   * Lists all versions of a prompt.
   * @param name - The prompt name
   * @returns Promise<Result<Prompt[], PersistenceError>>
   */
  async listVersions(
    name: string,
  ): Promise<Result<Prompt[], PersistenceError>> {
    const versionsResult = await this.client.listPromptVersions(name);

    if (Result.isFailure(versionsResult)) {
      return Result.failure(
        new PersistenceError(
          `Failed to list versions: ${Result.unwrapFailure(versionsResult).message}`,
        ),
      );
    }

    const langsmithPrompts = Result.unwrap(versionsResult);
    const domainPrompts: Prompt[] = [];

    for (const langsmithPrompt of langsmithPrompts) {
      const domainPromptResult = this.convertToDomainPrompt(langsmithPrompt);
      if (Result.isSuccess(domainPromptResult)) {
        domainPrompts.push(Result.unwrap(domainPromptResult));
      }
    }

    return Result.success(domainPrompts);
  }

  /**
   * Lists prompts with optional filtering.
   * @param filter - Optional filter criteria
   * @returns Promise<Result<Prompt[], PersistenceError>>
   */
  async list(
    filter?: PromptFilter,
  ): Promise<Result<Prompt[], PersistenceError>> {
    const promptsResult = await this.client.listPrompts();

    if (Result.isFailure(promptsResult)) {
      return Result.failure(
        new PersistenceError(
          `Failed to list prompts: ${Result.unwrapFailure(promptsResult).message}`,
        ),
      );
    }

    const langsmithPrompts = Result.unwrap(promptsResult);
    const domainPrompts: Prompt[] = [];

    for (const langsmithPrompt of langsmithPrompts) {
      const domainPromptResult = this.convertToDomainPrompt(langsmithPrompt);
      if (Result.isSuccess(domainPromptResult)) {
        const prompt = Result.unwrap(domainPromptResult);

        // Apply filters if provided
        if (filter) {
          if (
            filter.namePattern &&
            !prompt.getName().includes(filter.namePattern)
          ) {
            continue;
          }
          if (
            filter.category &&
            prompt.getMetadata().getCategory() !== filter.category
          ) {
            continue;
          }
          if (filter.tags && filter.tags.length > 0) {
            const promptTags = prompt.getMetadata().getTags();
            if (!filter.tags.some((tag) => promptTags.includes(tag))) {
              continue;
            }
          }
        }

        domainPrompts.push(prompt);
      }
    }

    return Result.success(domainPrompts);
  }

  /**
   * Finds prompts by category.
   * @param category - The category to filter by
   * @returns Promise<Result<Prompt[], PersistenceError>>
   */
  async findByCategory(
    category: PromptCategory,
  ): Promise<Result<Prompt[], PersistenceError>> {
    return this.list({ category });
  }

  /**
   * Finds prompts by tags.
   * @param tags - Tags to search for
   * @returns Promise<Result<Prompt[], PersistenceError>>
   */
  async findByTags(
    tags: string[],
  ): Promise<Result<Prompt[], PersistenceError>> {
    return this.list({ tags });
  }

  /**
   * Checks if a prompt exists by ID.
   * @param id - The prompt ID to check
   * @returns Promise<boolean>
   */
  async exists(id: PromptId): Promise<boolean> {
    const result = await this.findById(id);
    return Result.isSuccess(result);
  }

  /**
   * Counts total prompts matching filter.
   * @param filter - Optional filter criteria
   * @returns Promise<Result<number, PersistenceError>>
   */
  async count(
    filter?: PromptFilter,
  ): Promise<Result<number, PersistenceError>> {
    const listResult = await this.list(filter);
    if (Result.isFailure(listResult)) {
      return Result.failure(Result.unwrapFailure(listResult));
    }
    return Result.success(Result.unwrap(listResult).length);
  }

  // #region Not Supported Operations
  /**
   * Saves a prompt - not supported for LangSmith.
   * LangSmith prompts should be managed through the LangSmith UI.
   */
  async save(_prompt: Prompt): Promise<Result<void, PersistenceError>> {
    return Result.failure(
      new PersistenceError("Cannot save prompts to LangSmith via repository"),
    );
  }

  /**
   * Updates a prompt - not supported for LangSmith.
   * LangSmith prompts should be managed through the LangSmith UI.
   */
  async update(_prompt: Prompt): Promise<Result<void, PersistenceError>> {
    return Result.failure(
      new PersistenceError("Cannot update prompts in LangSmith via repository"),
    );
  }

  /**
   * Deletes a prompt - not supported for LangSmith.
   * LangSmith prompts should be managed through the LangSmith UI.
   */
  async delete(
    _id: PromptId,
  ): Promise<Result<void, NotFoundError | PersistenceError>> {
    return Result.failure(
      new PersistenceError(
        "Cannot delete prompts from LangSmith via repository",
      ),
    );
  }
  // #endregion
}
