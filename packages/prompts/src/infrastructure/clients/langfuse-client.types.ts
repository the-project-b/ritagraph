import type { ChatPromptClient, TextPromptClient } from "@langfuse/client";
import { PersistenceError } from "../../shared/errors/domain.errors.js";
import { Result } from "../../shared/types/result.js";

/**
 * Represents a message in a chat prompt for LangFuse.
 */
export interface LangFuseMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
}

/**
 * Model configuration for prompts.
 */
export interface LangFuseModelConfig {
  model?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  seed?: number;
  [key: string]: unknown;
}

/**
 * Base prompt properties shared between text and chat prompts.
 */
interface BaseLangFusePrompt {
  id: string;
  name: string;
  version: number;
  config?: LangFuseModelConfig;
  labels: string[];
  tags: string[];
  inputVariables: string[];
  createdAt: string;
  updatedAt: string;
  isFallback: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Text prompt with single string template.
 */
export interface TextLangFusePrompt extends BaseLangFusePrompt {
  type: "text";
  prompt: string;
}

/**
 * Chat prompt with message array.
 */
export interface ChatLangFusePrompt extends BaseLangFusePrompt {
  type: "chat";
  prompt: LangFuseMessage[];
}

/**
 * Discriminated union for LangFuse prompts.
 * Use type narrowing with the 'type' field to access specific properties.
 */
export type LangFusePrompt = TextLangFusePrompt | ChatLangFusePrompt;

/**
 * Type guard to check if a prompt is a text prompt.
 */
export function isTextPrompt(
  prompt: LangFusePrompt,
): prompt is TextLangFusePrompt {
  return prompt.type === "text";
}

/**
 * Type guard to check if a prompt is a chat prompt.
 */
export function isChatPrompt(
  prompt: LangFusePrompt,
): prompt is ChatLangFusePrompt {
  return prompt.type === "chat";
}

/**
 * Options for fetching prompts from LangFuse.
 */
export interface LangFusePullOptions {
  type?: "text" | "chat";
  version?: number;
  label?: string;
  cacheTtlSeconds?: number;
  maxRetries?: number;
  fetchTimeoutMs?: number;
  fallback?: string | LangFuseMessage[];
}

/**
 * Compiled prompt from LangFuse after variable substitution.
 */
export interface LangFuseCompiledPrompt {
  prompt: string | LangFuseMessage[];
  config?: LangFusePrompt["config"];
  isFallback: boolean;
}

/**
 * Base parameters for creating a prompt.
 */
interface BaseCreatePromptParams {
  name: string;
  config?: LangFuseModelConfig;
  labels?: string[];
  tags?: string[];
}

/**
 * Parameters for creating a text prompt.
 */
export interface CreateTextPromptParams extends BaseCreatePromptParams {
  type: "text";
  prompt: string;
}

/**
 * Parameters for creating a chat prompt.
 */
export interface CreateChatPromptParams extends BaseCreatePromptParams {
  type: "chat";
  prompt: LangFuseMessage[];
}

/**
 * LangFuse client interface.
 * Abstracts the LangFuse SDK for testing and flexibility.
 */
export interface LangFuseClient {
  /**
   * Gets a prompt from LangFuse by name.
   * @param promptName - The name of the prompt
   * @param version - Optional version number
   * @param options - Additional options for fetching
   * @returns Promise<Result<LangFusePrompt, PersistenceError>>
   */
  getPrompt(
    promptName: string,
    version?: number,
    options?: LangFusePullOptions,
  ): Promise<Result<LangFusePrompt, PersistenceError>>;

  /**
   * Compiles a prompt template with variables.
   * @param template - The template string or messages
   * @param variables - Variables to substitute
   * @param placeholders - Placeholder values for complex substitutions
   * @returns string | LangFuseMessage[] - Compiled prompt
   */
  compile(
    template: string | LangFuseMessage[],
    variables?: Record<string, unknown>,
    placeholders?: Record<string, unknown>,
  ): string | LangFuseMessage[];

  /**
   * Creates a new prompt in LangFuse using discriminated union.
   * @param params - Prompt creation parameters (text or chat)
   * @returns Promise<Result<LangFusePrompt, PersistenceError>>
   */
  createPrompt?(
    params: CreateTextPromptParams | CreateChatPromptParams,
  ): Promise<Result<LangFusePrompt, PersistenceError>>;
}

/**
 * Configuration for LangFuse client.
 */
export interface LangFuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  release?: string;
  flushAt?: number;
  flushInterval?: number;
}

/**
 * Type guard to check if a prompt client is a TextPromptClient.
 * Text prompts have a string prompt property.
 */
export function isTextPromptClient(
  client: TextPromptClient | ChatPromptClient,
): client is TextPromptClient {
  return typeof client.prompt === "string";
}

/**
 * Type guard to check if a prompt client is a ChatPromptClient.
 * Chat prompts have an array of messages as the prompt property.
 */
export function isChatPromptClient(
  client: TextPromptClient | ChatPromptClient,
): client is ChatPromptClient {
  return Array.isArray(client.prompt);
}

/**
 * Utility type to extract prompt content based on type.
 */
export type PromptContent<T extends LangFusePrompt> =
  T extends TextLangFusePrompt
    ? string
    : T extends ChatLangFusePrompt
      ? LangFuseMessage[]
      : never;

/**
 * Utility type to extract the correct fallback type based on prompt type.
 */
export type FallbackType<T extends "text" | "chat"> = T extends "text"
  ? string
  : T extends "chat"
    ? LangFuseMessage[]
    : string | LangFuseMessage[];
