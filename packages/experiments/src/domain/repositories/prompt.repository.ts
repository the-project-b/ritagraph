import { NotFoundError, PersistenceError, Result } from "@the-project-b/types";

export interface PromptInfo {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  owner: string;
  fullName: string;
  tags?: string[];
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface PromptContent {
  id: string;
  name: string;
  template: string;
  variables?: string[];
  metadata?: Record<string, any>;
}

export interface PromptFilter {
  tags?: string[];
  isPublic?: boolean;
  owner?: string;
  limit?: number;
  offset?: number;
}

/**
 * Repository interface for Prompt operations
 */
export interface PromptRepository {
  /**
   * List available prompts
   */
  list(filter?: PromptFilter): Promise<Result<PromptInfo[], PersistenceError>>;

  /**
   * Pull a prompt by name and get its content
   */
  pull(name: string): Promise<Result<PromptContent, NotFoundError>>;

  /**
   * Convert prompt data to text format
   */
  convertToText(promptData: any): Promise<Result<string, PersistenceError>>;

  /**
   * Save a prompt
   */
  save(prompt: PromptContent): Promise<Result<void, PersistenceError>>;

  /**
   * Delete a prompt
   */
  delete(name: string): Promise<Result<void, PersistenceError>>;
}
