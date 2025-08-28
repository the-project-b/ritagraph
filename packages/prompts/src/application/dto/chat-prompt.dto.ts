import { LanguageCode } from "../../domain/value-objects/language-code.value-object.js";

/**
 * Supported message roles for chat prompts.
 */
export type MessageRole = "system" | "human" | "ai" | "assistant" | "function";

/**
 * Base interface for chat messages.
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  tags?: string[];
  additional_kwargs?: Record<string, unknown>;
}

/**
 * Specification for creating a message in a chat prompt.
 */
export type MessageSpec =
  | { type: "system"; content: string; tags?: string[] }
  | { type: "human"; content: string; tags?: string[] }
  | { type: "ai"; content: string; tags?: string[] }
  | { type: "assistant"; content: string; tags?: string[] }
  | {
      type: "prompt";
      promptName: string;
      variables?: Record<string, unknown>;
      role: MessageRole;
      tags?: string[];
    };

/**
 * Configuration for chat prompt creation.
 */
export interface ChatPromptConfig {
  language?: LanguageCode;
  filterTags?: string[];
  excludeTags?: string[];
  correlationId?: string;
}

/**
 * Parameters for creating a chat prompt.
 */
export interface CreateChatPromptParams {
  messages: MessageSpec[];
  config?: ChatPromptConfig;
}

/**
 * Represents a formatted chat prompt with messages.
 */
export interface ChatPromptResponse {
  messages: ChatMessage[];
  metadata: {
    messageCount: number;
    language: string;
    tags: string[];
    timestamp: Date;
    correlationId?: string;
    promptsUsed: Array<{
      promptId: string;
      promptName: string;
      version: string;
    }>;
  };
}

/**
 * Parameters for formatting messages with a chat prompt.
 */
export interface FormatChatMessagesParams {
  messages: MessageSpec[];
  variables?: Record<string, unknown>;
  config?: ChatPromptConfig;
}
