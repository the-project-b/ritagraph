import type {
  BaseMessagePromptTemplate,
  BasePromptTemplate,
} from "@langchain/core/prompts";
import { PersistenceError } from "../../shared/errors/domain.errors.js";
import { Result } from "../../shared/types/result.js";

/**
 * Represents a message in a chat prompt.
 */
export interface LangSmithMessage {
  role: "system" | "human" | "assistant" | "user" | string;
  content: string;
}

/**
 * LangSmith prompt representation based on the actual SDK.
 * Represents the structure returned by the LangSmith API.
 */
export interface LangSmithPrompt {
  id: string;
  name: string;
  description?: string;
  object: string; // Usually "prompt"
  // The template can be a string for simple prompts or an array for chat prompts
  template: string | LangSmithMessage[];
  input_variables?: string[];
  // Metadata about the prompt
  metadata?: {
    tags?: string[];
    version?: string;
    [key: string]: unknown;
  };
  created_at?: string;
  updated_at?: string;
  // Optional model configuration
  model?: {
    model_name?: string;
    temperature?: number;
    max_tokens?: number;
    [key: string]: unknown;
  };
}

/**
 * Options for pulling prompts from LangSmith.
 * Based on the actual SDK parameters.
 */
export interface LangSmithPullOptions {
  // Specific commit hash or tag
  version?: string;
  // Include model configuration in the response
  includeModel?: boolean;
}

/**
 * LangSmith client interface.
 * Abstracts the LangSmith SDK for testing and flexibility.
 */
export interface LangSmithClient {
  /**
   * Pulls a prompt from LangSmith by name.
   * Mirrors the SDK's pullPrompt functionality.
   * @param promptName - The name of the prompt in LangSmith (e.g., "my-prompt" or "owner/my-prompt")
   * @param options - Optional pull parameters
   * @returns Promise<Result<LangSmithPrompt, PersistenceError>>
   */
  pullPrompt(
    promptName: string,
    options?: LangSmithPullOptions,
  ): Promise<Result<LangSmithPrompt, PersistenceError>>;

  /**
   * Lists all prompts in LangSmith (if supported).
   * Note: This might not be available in all SDK versions.
   * @param limit - Maximum number of prompts to return
   * @param offset - Offset for pagination
   * @returns Promise<Result<LangSmithPrompt[], PersistenceError>>
   */
  listPrompts?(
    limit?: number,
    offset?: number,
  ): Promise<Result<LangSmithPrompt[], PersistenceError>>;

  /**
   * Lists all versions of a specific prompt (if supported).
   * Note: This might require additional API calls.
   * @param promptName - The name of the prompt
   * @returns Promise<Result<LangSmithPrompt[], PersistenceError>>
   */
  listPromptVersions?(
    promptName: string,
  ): Promise<Result<LangSmithPrompt[], PersistenceError>>;
}

/**
 * Configuration for LangSmith client.
 */
export interface LangSmithConfig {
  apiKey: string;
  apiUrl?: string;
  workspace?: string;
}

/**
 * Extended prompt template with LangSmith metadata.
 * This represents the actual structure returned by hub.pull()
 */
export interface LangSmithPromptTemplate
  extends Omit<BasePromptTemplate, "lc_kwargs"> {
  metadata?: {
    lc_hub_owner?: string;
    lc_hub_repo?: string;
    lc_hub_commit_hash?: string;
    version?: string;
    tags?: string[];
    [key: string]: unknown;
  };
  lc_kwargs?: {
    promptMessages?: BaseMessagePromptTemplate[];
    inputVariables?: string[];
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * Message prompt template with nested prompt structure.
 * This represents the structure of messages in ChatPromptTemplate.
 */
export interface MessagePromptWithNestedTemplate
  extends BaseMessagePromptTemplate {
  prompt?: {
    template?: string;
    inputVariables?: string[];
    template_format?: string;
    [key: string]: unknown;
  };
}

/**
 * Metadata extracted from LangSmith prompt.
 */
export interface LangSmithMetadata {
  lc_hub_owner?: string;
  lc_hub_repo?: string;
  lc_hub_commit_hash?: string;
  version?: string;
  tags?: string[];
  source?: string;
  promptName?: string;
  [key: string]: unknown;
}
