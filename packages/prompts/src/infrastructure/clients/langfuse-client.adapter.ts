import {
  LangfuseClient as LangfuseSDKClient,
  type ChatPromptClient,
  type TextPromptClient,
} from "@langfuse/client";
import type { Logger } from "@the-project-b/logging";
import { PersistenceError } from "../../shared/errors/domain.errors.js";
import { Result } from "../../shared/types/result.js";
import type {
  ChatLangFusePrompt,
  CreateChatPromptParams,
  CreateTextPromptParams,
  LangFuseClient,
  LangFuseConfig,
  LangFuseMessage,
  LangFuseModelConfig,
  LangFusePrompt,
  LangFusePullOptions,
  TextLangFusePrompt,
} from "./langfuse-client.types.js";
import { isTextPromptClient } from "./langfuse-client.types.js";

/**
 * Adapter for the LangFuse SDK Client.
 * Provides integration with LangFuse prompt management system.
 *
 * Environment variables:
 * - LANGFUSE_TARGET_LABEL: Override default label (e.g., "production", "latest", "staging")
 * - NODE_ENV: Used to determine default behavior (production = "production" label, otherwise "latest")
 */
export class LangFuseClientAdapter implements LangFuseClient {
  private client: LangfuseSDKClient;
  private defaultLabel: string;

  constructor(
    config: LangFuseConfig,
    private readonly logger?: Logger,
  ) {
    this.client = new LangfuseSDKClient({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
    });

    // Determine default label based on environment
    // Priority: LANGFUSE_TARGET_LABEL > NODE_ENV-based default > "production"
    this.defaultLabel = this.determineDefaultLabel();

    this.logger?.info("LangFuse client initialized", {
      baseUrl: config.baseUrl || "https://cloud.langfuse.com",
      defaultLabel: this.defaultLabel,
      NODE_ENV: process.env.NODE_ENV,
      LANGFUSE_TARGET_LABEL: process.env.LANGFUSE_TARGET_LABEL,
    });
  }

  /**
   * Determines the default label to use for prompt fetching.
   * - LANGFUSE_TARGET_LABEL takes precedence
   * - In production (NODE_ENV=production), defaults to "production"
   * - In development, defaults to "latest"
   * - If no label specified and no env vars, defaults to "production" (LangFuse default)
   */
  private determineDefaultLabel(): string {
    if (process.env.LANGFUSE_TARGET_LABEL) {
      return process.env.LANGFUSE_TARGET_LABEL;
    }

    if (process.env.NODE_ENV === "production") {
      return "production";
    }

    if (
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test"
    ) {
      return "latest";
    }

    // Default to production label for safety
    return "production";
  }

  /**
   * Gets a prompt from LangFuse by name.
   * @param promptName - The name of the prompt
   * @param version - Optional version number
   * @param options - Optional options for fetching
   * @returns Promise<Result<LangFusePrompt, PersistenceError>>
   */
  async getPrompt(
    promptName: string,
    version?: number,
    options?: LangFusePullOptions,
  ): Promise<Result<LangFusePrompt, PersistenceError>> {
    try {
      const effectiveLabel =
        options?.label || (version ? undefined : this.defaultLabel);

      this.logger?.debug("Fetching prompt from LangFuse", {
        promptName,
        version,
        label: effectiveLabel,
      });

      // SDK requires different overloads for text vs chat
      const promptClient = await (options?.type === "chat"
        ? this.client.prompt.get(promptName, {
            version,
            label: effectiveLabel,
            type: "chat",
            cacheTtlSeconds: options?.cacheTtlSeconds,
            maxRetries: options?.maxRetries,
            fetchTimeoutMs: options?.fetchTimeoutMs,
            fallback: options?.fallback as LangFuseMessage[] | undefined,
          })
        : options?.type === "text"
          ? this.client.prompt.get(promptName, {
              version,
              label: effectiveLabel,
              type: "text",
              cacheTtlSeconds: options?.cacheTtlSeconds,
              maxRetries: options?.maxRetries,
              fetchTimeoutMs: options?.fetchTimeoutMs,
              fallback: options?.fallback as string | undefined,
            })
          : this.client.prompt.get(promptName, {
              version,
              label: effectiveLabel,
              cacheTtlSeconds: options?.cacheTtlSeconds,
              maxRetries: options?.maxRetries,
              fetchTimeoutMs: options?.fetchTimeoutMs,
            }));

      return isTextPromptClient(promptClient)
        ? Result.success(
            this.transformTextPromptClient(promptClient, promptName),
          )
        : Result.success(
            this.transformChatPromptClient(promptClient, promptName),
          );
    } catch (error) {
      this.logger?.error("Failed to fetch prompt from LangFuse", {
        promptName,
        version,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error occurred while fetching prompt";

      return Result.failure(
        new PersistenceError(`Failed to fetch prompt: ${errorMessage}`),
      );
    }
  }

  /**
   * Transforms a TextPromptClient to our internal format.
   */
  private transformTextPromptClient(
    promptClient: TextPromptClient,
    promptName: string,
  ): TextLangFusePrompt {
    return {
      type: "text",
      id: promptName,
      name: promptName,
      prompt: promptClient.prompt,
      version: promptClient.version,
      config: promptClient.config as LangFuseModelConfig,
      labels: promptClient.labels || [],
      tags: promptClient.tags || [],
      inputVariables: this.extractVariables(promptClient.prompt),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFallback: promptClient.isFallback || false,
      metadata: {
        source: "langfuse",
        promptName,
        version: promptClient.version,
      },
    };
  }

  /**
   * Transforms a ChatPromptClient to our internal format.
   */
  private transformChatPromptClient(
    promptClient: ChatPromptClient,
    promptName: string,
  ): ChatLangFusePrompt {
    const messages: LangFuseMessage[] = promptClient.prompt
      .filter(
        (msg): msg is Extract<typeof msg, { role: string }> =>
          "role" in msg && "content" in msg,
      )
      .map((msg) => ({
        role: msg.role as LangFuseMessage["role"],
        content:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
      }));

    const inputVariables = new Set<string>();
    messages.forEach((msg) => {
      this.extractVariables(msg.content).forEach((v) => inputVariables.add(v));
    });

    return {
      type: "chat",
      id: promptName,
      name: promptName,
      prompt: messages,
      version: promptClient.version,
      config: promptClient.config as LangFuseModelConfig,
      labels: promptClient.labels || [],
      tags: promptClient.tags || [],
      inputVariables: Array.from(inputVariables),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFallback: promptClient.isFallback || false,
      metadata: {
        source: "langfuse",
        promptName,
        version: promptClient.version,
      },
    };
  }

  /**
   * Extracts variable names from a template string.
   */
  private extractVariables(template: string): string[] {
    const variablePattern = /\{\{(\w+)\}\}/g;
    const matches = template.matchAll(variablePattern);
    const variables = new Set<string>();

    for (const match of matches) {
      if (match[1]) {
        variables.add(match[1]);
      }
    }

    return Array.from(variables);
  }

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
  ): string | LangFuseMessage[] {
    const allVars = { ...variables, ...placeholders };

    if (typeof template === "string") {
      return this.compileString(template, allVars);
    }

    return template.map((msg) => ({
      ...msg,
      content: this.compileString(msg.content, allVars),
    }));
  }

  /**
   * Compiles a string template with variable substitution.
   */
  private compileString(
    template: string,
    variables?: Record<string, unknown>,
  ): string {
    if (!variables) {
      return template;
    }

    let compiled = template;
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      compiled = compiled.replace(pattern, this.convertToString(value));
    }

    return compiled;
  }

  /**
   * Converts any value to a string representation.
   */
  private convertToString(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.convertToString(item)).join("\n");
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  /**
   * Creates a new prompt in LangFuse.
   * @param params - Prompt creation parameters
   * @returns Promise<Result<LangFusePrompt, PersistenceError>>
   */
  async createPrompt(
    params: CreateTextPromptParams | CreateChatPromptParams,
  ): Promise<Result<LangFusePrompt, PersistenceError>> {
    try {
      this.logger?.debug("Creating prompt in LangFuse", {
        name: params.name,
        type: params.type,
        hasConfig: !!params.config,
        labels: params.labels,
      });

      if (params.type === "chat") {
        const result = await this.client.prompt.create({
          name: params.name,
          prompt: params.prompt,
          type: "chat",
          config: params.config,
          labels: params.labels,
        });

        const transformed = this.transformChatPromptClient(
          result as ChatPromptClient,
          params.name,
        );
        return Result.success(transformed);
      } else {
        const result = await this.client.prompt.create({
          name: params.name,
          prompt: params.prompt,
          type: "text",
          config: params.config,
          labels: params.labels,
        });

        const transformed = this.transformTextPromptClient(
          result as TextPromptClient,
          params.name,
        );
        return Result.success(transformed);
      }
    } catch (error) {
      this.logger?.error("Failed to create prompt in LangFuse", {
        name: params.name,
        error: error instanceof Error ? error.message : error,
      });

      return Result.failure(
        new PersistenceError(
          `Failed to create prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  /**
   * Flushes any pending events to LangFuse.
   */
  async flush(): Promise<void> {
    await this.client.flush();
  }

  /**
   * Shuts down the client and flushes remaining events.
   */
  async shutdown(): Promise<void> {
    await this.client.flush();
  }
}
