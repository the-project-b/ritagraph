import { Result } from "../../shared/types/result.js";
import {
  NotFoundError,
  PersistenceError,
} from "../../shared/errors/domain.errors.js";
import { Prompt } from "../../domain/entities/prompt.entity.js";
import { PromptRepository } from "../../domain/repositories/prompt.repository.js";
import { Logger } from "@the-project-b/logging";

/**
 * Service for managing prompt registration and caching.
 * Provides efficient lookup and caching mechanisms for frequently used prompts.
 */
export class PromptRegistryService {
  private readonly prompts = new Map<string, Prompt>();
  private readonly logger: Logger;

  constructor(
    private readonly repository: PromptRepository,
    logger?: Logger,
  ) {
    this.logger = logger || new Logger({ service: "prompt-registry" });
  }

  // #region Registration
  /**
   * Registers a prompt for quick access.
   * @param prompt - The prompt to register
   * @returns Result<void, PersistenceError> - Success or persistence error
   */
  async register(prompt: Prompt): Promise<Result<void, PersistenceError>> {
    const promptName = prompt.getName();

    this.logger.info("Registering prompt", {
      promptName,
      promptId: prompt.getId().toString(),
      languages: prompt.getAvailableLanguages().map((l) => l.toString()),
    });

    this.prompts.set(promptName, prompt);

    const saveResult = await this.repository.save(prompt);

    if (Result.isFailure(saveResult)) {
      const error = Result.unwrapFailure(saveResult);
      this.logger.error("Failed to save prompt to repository", {
        promptName,
        error: error.message,
      });
      this.prompts.delete(promptName);
      return saveResult;
    }

    this.logger.info("Prompt registered successfully", {
      promptName,
      cacheSize: this.prompts.size,
    });

    return Result.success(void 0);
  }

  /**
   * Bulk registers multiple prompts.
   * @param prompts - Array of prompts to register
   * @returns Result<void, PersistenceError> - Success or first error encountered
   */
  async registerMany(
    prompts: Prompt[],
  ): Promise<Result<void, PersistenceError>> {
    this.logger.info("Bulk registering prompts", {
      count: prompts.length,
    });

    for (const prompt of prompts) {
      const result = await this.register(prompt);
      if (Result.isFailure(result)) {
        return result;
      }
    }

    return Result.success(void 0);
  }
  // #endregion

  // #region Retrieval
  /**
   * Gets a prompt by name with caching.
   * @param name - The prompt name to retrieve
   * @returns Result<Prompt, NotFoundError> - Prompt or not found error
   */
  async get(name: string): Promise<Result<Prompt, NotFoundError>> {
    if (this.prompts.has(name)) {
      this.logger.debug("Prompt found in cache", { promptName: name });
      const prompt = this.prompts.get(name);
      if (prompt) {
        return Result.success(prompt);
      }
    }

    this.logger.debug("Prompt not in cache, fetching from repository", {
      promptName: name,
    });

    const result = await this.repository.findByName(name);

    if (Result.isSuccess(result)) {
      const prompt = Result.unwrap(result);
      this.prompts.set(name, prompt);
      this.logger.debug("Prompt cached for future use", {
        promptName: name,
        cacheSize: this.prompts.size,
      });
    } else {
      this.logger.error("Prompt not found in repository", {
        promptName: name,
        error: Result.unwrapFailure(result).message,
      });
    }

    return result;
  }

  /**
   * Gets all registered prompts from cache.
   * @returns Prompt[] - Array of cached prompts
   */
  getAllCached(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Checks if a prompt is registered.
   * @param name - The prompt name to check
   * @returns boolean - True if prompt is registered
   */
  has(name: string): boolean {
    return this.prompts.has(name);
  }
  // #endregion

  // #region Cache Management
  /**
   * Clears the cache.
   */
  clearCache(): void {
    const previousSize = this.prompts.size;
    this.prompts.clear();
    this.logger.info("Cache cleared", {
      previousSize,
      currentSize: 0,
    });
  }

  /**
   * Removes a specific prompt from cache.
   * @param name - The prompt name to remove
   * @returns boolean - True if prompt was removed
   */
  evict(name: string): boolean {
    const existed = this.prompts.delete(name);
    if (existed) {
      this.logger.debug("Prompt evicted from cache", {
        promptName: name,
        cacheSize: this.prompts.size,
      });
    }
    return existed;
  }

  /**
   * Refreshes a prompt in the cache from the repository.
   * @param name - The prompt name to refresh
   * @returns Result<void, NotFoundError> - Success or not found error
   */
  async refresh(name: string): Promise<Result<void, NotFoundError>> {
    this.logger.info("Refreshing prompt from repository", { promptName: name });

    const result = await this.repository.findByName(name);

    if (Result.isFailure(result)) {
      this.logger.error("Failed to refresh prompt", {
        promptName: name,
        error: Result.unwrapFailure(result).message,
      });
      return Result.failure(Result.unwrapFailure(result));
    }

    const prompt = Result.unwrap(result);
    this.prompts.set(name, prompt);

    this.logger.info("Prompt refreshed successfully", {
      promptName: name,
    });

    return Result.success(void 0);
  }

  /**
   * Gets cache statistics.
   * @returns object - Cache statistics
   */
  getCacheStats(): {
    size: number;
    promptNames: string[];
  } {
    return {
      size: this.prompts.size,
      promptNames: Array.from(this.prompts.keys()),
    };
  }
  // #endregion
}
