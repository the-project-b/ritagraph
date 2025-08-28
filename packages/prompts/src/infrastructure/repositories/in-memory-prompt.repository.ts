import { Logger } from "@the-project-b/logging";
import { Prompt } from "../../domain/entities/prompt.entity.js";
import {
  PromptFilter,
  PromptRepository,
} from "../../domain/repositories/prompt.repository.js";
import { PromptId } from "../../domain/value-objects/prompt-id.value-object.js";
import { PromptCategory } from "../../domain/value-objects/prompt-metadata.value-object.js";
import {
  NotFoundError,
  PersistenceError,
} from "../../shared/errors/domain.errors.js";
import { Result } from "../../shared/types/result.js";

/**
 * In-memory implementation of PromptRepository.
 * Provides storage for prompts during development and testing.
 */
export class InMemoryPromptRepository implements PromptRepository {
  private readonly prompts = new Map<string, Prompt>();
  private readonly promptsByName = new Map<string, Prompt>();
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger({ service: "in-memory-repository" });
  }

  // #region Basic CRUD Operations
  /**
   * Finds a prompt by its unique identifier.
   * @param id - The prompt ID to search for
   * @returns Promise<Result<Prompt, NotFoundError>> - Prompt or not found error
   */
  async findById(id: PromptId): Promise<Result<Prompt, NotFoundError>> {
    const prompt = this.prompts.get(id.toString());

    if (!prompt) {
      this.logger.debug("Prompt not found by ID", { promptId: id.toString() });
      return Result.failure(new NotFoundError("Prompt", id.toString()));
    }

    this.logger.debug("Prompt found by ID", {
      promptId: id.toString(),
      promptName: prompt.getName(),
    });

    return Result.success(prompt);
  }

  /**
   * Finds a prompt by its name.
   * @param name - The prompt name to search for
   * @returns Promise<Result<Prompt, NotFoundError>> - Prompt or not found error
   */
  async findByName(name: string): Promise<Result<Prompt, NotFoundError>> {
    const prompt = this.promptsByName.get(name);

    if (!prompt) {
      this.logger.debug("Prompt not found by name", { promptName: name });
      return Result.failure(new NotFoundError("Prompt", name));
    }

    this.logger.debug("Prompt found by name", {
      promptName: name,
      promptId: prompt.getId().toString(),
    });

    return Result.success(prompt);
  }

  /**
   * Saves a prompt to the repository.
   * @param prompt - The prompt to save
   * @returns Promise<Result<void, PersistenceError>> - Success or persistence error
   */
  async save(prompt: Prompt): Promise<Result<void, PersistenceError>> {
    const id = prompt.getId().toString();
    const name = prompt.getName();

    this.prompts.set(id, prompt);
    this.promptsByName.set(name, prompt);

    this.logger.info("Prompt saved", {
      promptId: id,
      promptName: name,
      languages: prompt.getAvailableLanguages().map((l) => l.toString()),
    });

    return Result.success(void 0);
  }

  /**
   * Updates an existing prompt.
   * @param prompt - The prompt to update
   * @returns Promise<Result<void, PersistenceError>> - Success or persistence error
   */
  async update(prompt: Prompt): Promise<Result<void, PersistenceError>> {
    const id = prompt.getId().toString();

    if (!this.prompts.has(id)) {
      return Result.failure(
        new PersistenceError(`Cannot update non-existent prompt with ID ${id}`),
      );
    }

    const oldPrompt = this.prompts.get(id);
    if (oldPrompt) {
      const oldName = oldPrompt.getName();
      if (oldName !== prompt.getName()) {
        this.promptsByName.delete(oldName);
      }
    }

    this.prompts.set(id, prompt);
    this.promptsByName.set(prompt.getName(), prompt);

    this.logger.info("Prompt updated", {
      promptId: id,
      promptName: prompt.getName(),
    });

    return Result.success(void 0);
  }

  /**
   * Deletes a prompt by ID.
   * @param id - The prompt ID to delete
   * @returns Promise<Result<void, NotFoundError | PersistenceError>> - Success or error
   */
  async delete(
    id: PromptId,
  ): Promise<Result<void, NotFoundError | PersistenceError>> {
    const idStr = id.toString();
    const prompt = this.prompts.get(idStr);

    if (!prompt) {
      return Result.failure(new NotFoundError("Prompt", idStr));
    }

    this.prompts.delete(idStr);
    this.promptsByName.delete(prompt.getName());

    this.logger.info("Prompt deleted", {
      promptId: idStr,
      promptName: prompt.getName(),
    });

    return Result.success(void 0);
  }
  // #endregion

  // #region Query Operations
  /**
   * Lists prompts with optional filtering.
   * @param filter - Optional filter criteria
   * @returns Promise<Result<Prompt[], PersistenceError>> - List of prompts or error
   */
  async list(
    filter?: PromptFilter,
  ): Promise<Result<Prompt[], PersistenceError>> {
    let prompts = Array.from(this.prompts.values());

    if (filter) {
      prompts = this.applyFilter(prompts, filter);
    }

    this.logger.debug("Listed prompts", {
      totalCount: this.prompts.size,
      filteredCount: prompts.length,
      filter,
    });

    return Result.success(prompts);
  }

  /**
   * Finds prompts by category.
   * @param category - The category to filter by
   * @returns Promise<Result<Prompt[], PersistenceError>> - List of prompts or error
   */
  async findByCategory(
    category: PromptCategory,
  ): Promise<Result<Prompt[], PersistenceError>> {
    const prompts = Array.from(this.prompts.values()).filter(
      (p) => p.getMetadata().getCategory() === category,
    );

    this.logger.debug("Found prompts by category", {
      category,
      count: prompts.length,
    });

    return Result.success(prompts);
  }

  /**
   * Finds prompts by tags.
   * @param tags - Tags to search for (any match)
   * @returns Promise<Result<Prompt[], PersistenceError>> - List of prompts or error
   */
  async findByTags(
    tags: string[],
  ): Promise<Result<Prompt[], PersistenceError>> {
    const prompts = Array.from(this.prompts.values()).filter((p) => {
      const promptTags = p.getMetadata().getTags();
      return tags.some((tag) => promptTags.includes(tag));
    });

    this.logger.debug("Found prompts by tags", {
      tags,
      count: prompts.length,
    });

    return Result.success(prompts);
  }

  /**
   * Checks if a prompt exists by ID.
   * @param id - The prompt ID to check
   * @returns Promise<boolean> - True if prompt exists
   */
  async exists(id: PromptId): Promise<boolean> {
    const exists = this.prompts.has(id.toString());

    this.logger.debug("Checked prompt existence", {
      promptId: id.toString(),
      exists,
    });

    return exists;
  }

  /**
   * Counts total prompts matching filter.
   * @param filter - Optional filter criteria
   * @returns Promise<Result<number, PersistenceError>> - Count or error
   */
  async count(
    filter?: PromptFilter,
  ): Promise<Result<number, PersistenceError>> {
    let prompts = Array.from(this.prompts.values());

    if (filter) {
      prompts = this.applyFilter(prompts, filter);
    }

    return Result.success(prompts.length);
  }
  // #endregion

  // #region LangSmith Preparation
  /**
   * Gets the latest version of a prompt.
   * @param name - The prompt name
   * @returns Promise<Result<Prompt, NotFoundError>> - Latest prompt version or error
   */
  async getLatestVersion(name: string): Promise<Result<Prompt, NotFoundError>> {
    return this.findByName(name);
  }

  /**
   * Lists all versions of a prompt.
   * @param name - The prompt name
   * @returns Promise<Result<Prompt[], PersistenceError>> - List of versions or error
   */
  async listVersions(
    name: string,
  ): Promise<Result<Prompt[], PersistenceError>> {
    const prompt = this.promptsByName.get(name);

    if (!prompt) {
      return Result.success([]);
    }

    return Result.success([prompt]);
  }
  // #endregion

  // #region Helper Methods
  /**
   * Applies filter criteria to prompts.
   * @param prompts - Prompts to filter
   * @param filter - Filter criteria
   * @returns Prompt[] - Filtered prompts
   */
  private applyFilter(prompts: Prompt[], filter: PromptFilter): Prompt[] {
    return prompts.filter((prompt) => {
      const metadata = prompt.getMetadata();

      if (filter.category && metadata.getCategory() !== filter.category) {
        return false;
      }

      if (
        filter.tags &&
        filter.tags.length > 0 &&
        !filter.tags.some((tag) => metadata.getTags().includes(tag))
      ) {
        return false;
      }

      if (filter.owner && metadata.getOwner() !== filter.owner) {
        return false;
      }

      if (filter.language && !prompt.hasLanguage(filter.language)) {
        return false;
      }

      if (
        filter.namePattern &&
        !prompt.getName().includes(filter.namePattern)
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Clears all stored prompts.
   */
  clear(): void {
    const count = this.prompts.size;
    this.prompts.clear();
    this.promptsByName.clear();

    this.logger.info("Repository cleared", { clearedCount: count });
  }

  /**
   * Gets repository statistics.
   * @returns object - Repository statistics
   */
  getStats(): {
    totalPrompts: number;
    uniqueNames: number;
    categories: PromptCategory[];
    languages: string[];
  } {
    const categories = new Set<PromptCategory>();
    const languages = new Set<string>();

    for (const prompt of this.prompts.values()) {
      categories.add(prompt.getMetadata().getCategory());
      for (const lang of prompt.getAvailableLanguages()) {
        languages.add(lang.toString());
      }
    }

    return {
      totalPrompts: this.prompts.size,
      uniqueNames: this.promptsByName.size,
      categories: Array.from(categories),
      languages: Array.from(languages),
    };
  }
  // #endregion
}
