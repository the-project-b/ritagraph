import { Result } from "../../shared/types/result.js";
import {
  NotFoundError,
  PersistenceError,
} from "../../shared/errors/domain.errors.js";
import { Prompt } from "../entities/prompt.entity.js";
import { PromptId } from "../value-objects/prompt-id.value-object.js";
import { PromptCategory } from "../value-objects/prompt-metadata.value-object.js";
import { LanguageCode } from "../value-objects/language-code.value-object.js";

/**
 * Filter criteria for prompt queries.
 */
export interface PromptFilter {
  category?: PromptCategory;
  tags?: string[];
  owner?: string;
  language?: LanguageCode;
  namePattern?: string;
}

/**
 * Repository interface for prompt persistence.
 * Abstracts storage mechanism for future LangSmith integration.
 */
export interface PromptRepository {
  // #region Basic CRUD Operations
  /**
   * Finds a prompt by its unique identifier.
   * @param id - The prompt ID to search for
   * @returns Promise<Result<Prompt, NotFoundError>> - Prompt or not found error
   */
  findById(id: PromptId): Promise<Result<Prompt, NotFoundError>>;

  /**
   * Finds a prompt by its name.
   * @param name - The prompt name to search for
   * @returns Promise<Result<Prompt, NotFoundError>> - Prompt or not found error
   */
  findByName(name: string): Promise<Result<Prompt, NotFoundError>>;

  /**
   * Saves a prompt to the repository.
   * @param prompt - The prompt to save
   * @returns Promise<Result<void, PersistenceError>> - Success or persistence error
   */
  save(prompt: Prompt): Promise<Result<void, PersistenceError>>;

  /**
   * Updates an existing prompt.
   * @param prompt - The prompt to update
   * @returns Promise<Result<void, PersistenceError>> - Success or persistence error
   */
  update(prompt: Prompt): Promise<Result<void, PersistenceError>>;

  /**
   * Deletes a prompt by ID.
   * @param id - The prompt ID to delete
   * @returns Promise<Result<void, NotFoundError | PersistenceError>> - Success or error
   */
  delete(id: PromptId): Promise<Result<void, NotFoundError | PersistenceError>>;
  // #endregion

  // #region Query Operations
  /**
   * Lists prompts with optional filtering.
   * @param filter - Optional filter criteria
   * @returns Promise<Result<Prompt[], PersistenceError>> - List of prompts or error
   */
  list(filter?: PromptFilter): Promise<Result<Prompt[], PersistenceError>>;

  /**
   * Finds prompts by category.
   * @param category - The category to filter by
   * @returns Promise<Result<Prompt[], PersistenceError>> - List of prompts or error
   */
  findByCategory(
    category: PromptCategory,
  ): Promise<Result<Prompt[], PersistenceError>>;

  /**
   * Finds prompts by tags.
   * @param tags - Tags to search for (any match)
   * @returns Promise<Result<Prompt[], PersistenceError>> - List of prompts or error
   */
  findByTags(tags: string[]): Promise<Result<Prompt[], PersistenceError>>;

  /**
   * Checks if a prompt exists by ID.
   * @param id - The prompt ID to check
   * @returns Promise<boolean> - True if prompt exists
   */
  exists(id: PromptId): Promise<boolean>;

  /**
   * Counts total prompts matching filter.
   * @param filter - Optional filter criteria
   * @returns Promise<Result<number, PersistenceError>> - Count or error
   */
  count(filter?: PromptFilter): Promise<Result<number, PersistenceError>>;
  // #endregion

  // #region LangSmith Preparation
  /**
   * Gets the latest version of a prompt.
   * @param name - The prompt name
   * @returns Promise<Result<Prompt, NotFoundError>> - Latest prompt version or error
   */
  getLatestVersion(name: string): Promise<Result<Prompt, NotFoundError>>;

  /**
   * Lists all versions of a prompt.
   * @param name - The prompt name
   * @returns Promise<Result<Prompt[], PersistenceError>> - List of versions or error
   */
  listVersions(name: string): Promise<Result<Prompt[], PersistenceError>>;
  // #endregion
}
