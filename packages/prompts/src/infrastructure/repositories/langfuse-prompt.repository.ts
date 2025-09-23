import type { Logger } from "@the-project-b/logging";
import {
  CreatePromptParams,
  Prompt,
} from "../../domain/entities/prompt.entity.js";
import {
  PromptFilter,
  PromptRepository,
} from "../../domain/repositories/prompt.repository.js";
import { LanguageCode } from "../../domain/value-objects/language-code.value-object.js";
import { PromptId } from "../../domain/value-objects/prompt-id.value-object.js";
import { PromptCategory } from "../../domain/value-objects/prompt-metadata.value-object.js";
import {
  PromptVariables,
  VariableDefinition,
} from "../../domain/value-objects/prompt-variables.value-object.js";
import {
  NotFoundError,
  PersistenceError,
} from "../../shared/errors/domain.errors.js";
import { Result } from "../../shared/types/result.js";
import type {
  LangFuseClient,
  LangFusePrompt,
} from "../clients/langfuse-client.types.js";
import { isTextPrompt } from "../clients/langfuse-client.types.js";

/**
 * Repository implementation for LangFuse prompt storage.
 * Adapts LangFuse API to domain repository interface.
 */
export class LangFusePromptRepository implements PromptRepository {
  constructor(
    public readonly client: LangFuseClient,
    private readonly logger?: Logger,
  ) {}

  /**
   * Converts a LangFuse prompt to domain Prompt entity.
   * @param langfusePrompt - The LangFuse prompt data
   * @returns Result<Prompt, PersistenceError>
   */
  private convertToDomainPrompt(
    langfusePrompt: LangFusePrompt,
  ): Result<Prompt, PersistenceError> {
    try {
      this.logger?.debug("Converting LangFuse prompt to domain", {
        id: langfusePrompt.id,
        name: langfusePrompt.name,
        type: langfusePrompt.type,
        hasConfig: !!langfusePrompt.config,
      });

      let templateContent: string;
      let variables: PromptVariables;

      if (isTextPrompt(langfusePrompt)) {
        templateContent = langfusePrompt.prompt;
      } else {
        const messages = langfusePrompt.prompt;
        const systemMessage = messages.find((msg) => msg.role === "system");

        if (systemMessage) {
          templateContent = systemMessage.content;
        } else {
          templateContent = messages
            .map((msg) => `[${msg.role}]: ${msg.content}`)
            .join("\n");
        }
      }

      // Convert LangFuse variables ({{var}}) to our format
      templateContent = this.convertVariableFormat(templateContent);

      // Extract variables from input_variables or from the template
      if (
        langfusePrompt.inputVariables &&
        langfusePrompt.inputVariables.length > 0
      ) {
        const variableDefinitions: VariableDefinition[] =
          langfusePrompt.inputVariables.map((varName) => ({
            name: varName,
            type: "string",
            required: false,
            description: `Variable ${varName} from LangFuse prompt`,
          }));

        const variablesResult = PromptVariables.create(variableDefinitions);
        if (Result.isFailure(variablesResult)) {
          throw new Error(
            `Failed to create variables: ${Result.unwrapFailure(variablesResult).message}`,
          );
        }
        variables = Result.unwrap(variablesResult);
      } else {
        // Extract variables from template
        const variablePattern = /\{(\w+)\}/g;
        const matches = templateContent.matchAll(variablePattern);
        const variableNames = new Set<string>();
        for (const match of matches) {
          if (match[1]) {
            variableNames.add(match[1]);
          }
        }

        if (variableNames.size > 0) {
          const variableDefinitions: VariableDefinition[] = Array.from(
            variableNames,
          ).map((name) => ({
            name,
            type: "string",
            required: false,
            description: `Variable ${name} extracted from template`,
          }));

          const variablesResult = PromptVariables.create(variableDefinitions);
          variables = Result.isSuccess(variablesResult)
            ? Result.unwrap(variablesResult)
            : PromptVariables.empty();
        } else {
          variables = PromptVariables.empty();
        }
      }

      const createParams: CreatePromptParams = {
        id: langfusePrompt.name,
        name: langfusePrompt.name,
        category: PromptCategory.SYSTEM,
        templates: {
          [LanguageCode.getDefault().toString()]: templateContent,
        },
        variables,
        metadata: {
          version: String(langfusePrompt.version),
          tags: langfusePrompt.tags || langfusePrompt.labels || [],
          description: "LangFuse prompt",
        },
      };

      this.logger?.debug("Creating domain prompt with params", {
        id: createParams.id,
        name: createParams.name,
        category: createParams.category,
        hasVariables: !!createParams.variables,
        metadata: createParams.metadata,
      });

      const promptResult = Prompt.create(createParams);

      if (Result.isFailure(promptResult)) {
        const error = Result.unwrapFailure(promptResult);
        this.logger?.error("Failed to create domain prompt", {
          error: error.message,
        });
        return Result.failure(
          new PersistenceError(
            `Failed to convert LangFuse prompt: ${error.message}`,
          ),
        );
      }

      return Result.success(Result.unwrap(promptResult));
    } catch (error) {
      this.logger?.error("Failed to convert LangFuse prompt", {
        error: error instanceof Error ? error.message : error,
      });
      return Result.failure(
        new PersistenceError(
          `Failed to convert LangFuse prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  /**
   * Converts LangFuse variable format {{var}} to our format {var}.
   * @param template - Template with LangFuse variables
   * @returns Template with our variable format
   */
  private convertVariableFormat(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, "{$1}");
  }

  /**
   * Finds a prompt by its unique identifier.
   * @param id - The prompt ID to search for
   * @returns Promise<Result<Prompt, NotFoundError>>
   */
  async findById(id: PromptId): Promise<Result<Prompt, NotFoundError>> {
    const name = id
      .toString()
      .replace(/^langfuse-/, "")
      .replace(/-v\d+$/, "");
    const versionMatch = id.toString().match(/-v(\d+)$/);
    const version = versionMatch ? parseInt(versionMatch[1], 10) : undefined;

    const promptResult = await this.client.getPrompt(name, version);

    if (Result.isFailure(promptResult)) {
      return Result.failure(new NotFoundError("Prompt", id.toString()));
    }

    const langfusePrompt = Result.unwrap(promptResult);
    const domainPromptResult = this.convertToDomainPrompt(langfusePrompt);

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
    const promptResult = await this.client.getPrompt(name);

    if (Result.isFailure(promptResult)) {
      this.logger?.error("Failed to fetch prompt from LangFuse", {
        name,
        error: Result.unwrapFailure(promptResult),
      });
      return Result.failure(new NotFoundError("Prompt", name));
    }

    const langfusePrompt = Result.unwrap(promptResult);
    const domainPromptResult = this.convertToDomainPrompt(langfusePrompt);

    if (Result.isFailure(domainPromptResult)) {
      this.logger?.error("Failed to convert LangFuse prompt to domain", {
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
    const promptResult = await this.client.getPrompt(name, undefined, {
      label: "latest",
    });

    if (Result.isFailure(promptResult)) {
      return Result.failure(new NotFoundError("Prompt", name));
    }

    const langfusePrompt = Result.unwrap(promptResult);
    const domainPromptResult = this.convertToDomainPrompt(langfusePrompt);

    if (Result.isFailure(domainPromptResult)) {
      return Result.failure(new NotFoundError("Prompt", name));
    }

    return Result.success(Result.unwrap(domainPromptResult));
  }

  /**
   * Lists all versions of a prompt.
   * Note: LangFuse doesn't directly support version listing through the SDK.
   * This returns only the current/production version.
   * @param name - The prompt name
   * @returns Promise<Result<Prompt[], PersistenceError>>
   */
  async listVersions(
    name: string,
  ): Promise<Result<Prompt[], PersistenceError>> {
    const promptResult = await this.findByName(name);

    if (Result.isFailure(promptResult)) {
      return Result.success([]);
    }

    return Result.success([Result.unwrap(promptResult)]);
  }

  /**
   * Lists prompts with optional filtering.
   * Note: LangFuse doesn't support listing all prompts through the SDK.
   * @param filter - Optional filter criteria
   * @returns Promise<Result<Prompt[], PersistenceError>>
   */
  async list(
    _filter?: PromptFilter,
  ): Promise<Result<Prompt[], PersistenceError>> {
    // LangFuse SDK doesn't support listing all prompts
    // This is a limitation compared to direct API access
    return Result.failure(
      new PersistenceError(
        "Listing prompts is not supported through LangFuse SDK. Prompts must be fetched by name.",
      ),
    );
  }

  /**
   * Finds prompts by category.
   * @param category - The category to filter by
   * @returns Promise<Result<Prompt[], PersistenceError>>
   */
  async findByCategory(
    _category: PromptCategory,
  ): Promise<Result<Prompt[], PersistenceError>> {
    return Result.failure(
      new PersistenceError(
        "Finding prompts by category is not supported for LangFuse repository",
      ),
    );
  }

  /**
   * Finds prompts by tags.
   * @param tags - Tags to search for
   * @returns Promise<Result<Prompt[], PersistenceError>>
   */
  async findByTags(
    _tags: string[],
  ): Promise<Result<Prompt[], PersistenceError>> {
    return Result.failure(
      new PersistenceError(
        "Finding prompts by tags is not supported for LangFuse repository",
      ),
    );
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
    _filter?: PromptFilter,
  ): Promise<Result<number, PersistenceError>> {
    return Result.failure(
      new PersistenceError(
        "Counting prompts is not supported for LangFuse repository",
      ),
    );
  }

  /**
   * Saves a prompt - creates it in LangFuse if the client supports it.
   * @param prompt - The prompt to save
   * @returns Promise<Result<void, PersistenceError>>
   */
  async save(prompt: Prompt): Promise<Result<void, PersistenceError>> {
    if (!this.client.createPrompt) {
      return Result.failure(
        new PersistenceError(
          "Creating prompts is not supported by this LangFuse client",
        ),
      );
    }

    // Get the default language template
    const defaultLang = LanguageCode.getDefault();
    const templateResult = prompt.getTemplate(defaultLang);

    if (Result.isFailure(templateResult)) {
      return Result.failure(
        new PersistenceError(
          "Cannot save prompt without default language template",
        ),
      );
    }

    const template = Result.unwrap(templateResult).getTemplate();

    // Convert our variable format {var} back to LangFuse format {{var}}
    const langfuseTemplate = template.replace(/\{(\w+)\}/g, "{{$1}}");

    const result = await this.client.createPrompt({
      name: prompt.getName(),
      prompt: langfuseTemplate,
      type: "text",
      tags: prompt.getMetadata().getTags(),
      labels: ["created-from-sdk"],
    });

    if (Result.isFailure(result)) {
      return Result.failure(Result.unwrapFailure(result));
    }

    return Result.success(void 0);
  }

  /**
   * Updates a prompt - not directly supported by LangFuse SDK.
   * @param prompt - The prompt to update
   * @returns Promise<Result<void, PersistenceError>>
   */
  async update(_prompt: Prompt): Promise<Result<void, PersistenceError>> {
    return Result.failure(
      new PersistenceError(
        "Updating prompts is not supported through LangFuse SDK",
      ),
    );
  }

  /**
   * Deletes a prompt - not supported by LangFuse SDK.
   * @param id - The prompt ID to delete
   * @returns Promise<Result<void, NotFoundError | PersistenceError>>
   */
  async delete(
    _id: PromptId,
  ): Promise<Result<void, NotFoundError | PersistenceError>> {
    return Result.failure(
      new PersistenceError(
        "Deleting prompts is not supported through LangFuse SDK",
      ),
    );
  }
}
