import type { BaseMessage } from "@langchain/core/messages";
import type {
  BasePromptTemplate,
  ChatPromptTemplate,
  PromptTemplate,
} from "@langchain/core/prompts";
import type { Logger } from "@the-project-b/logging";
import * as hub from "langchain/hub/node";
import { Client } from "langsmith";
import { PersistenceError } from "../../shared/errors/domain.errors.js";
import { Result } from "../../shared/types/result.js";
import type {
  LangSmithClient,
  LangSmithConfig,
  LangSmithMessage,
  LangSmithMetadata,
  LangSmithPrompt,
  LangSmithPromptTemplate,
  LangSmithPullOptions,
  MessagePromptWithNestedTemplate,
} from "./langsmith-client.types.js";

/**
 * Adapter for the actual LangSmith SDK Client.
 * Uses @langchain/core hub for pulling prompts from LangSmith.
 */
export class LangSmithClientAdapter implements LangSmithClient {
  private client: Client;

  constructor(
    config: LangSmithConfig,
    private readonly logger?: Logger,
  ) {
    // Initialize the LangSmith client for other operations
    this.client = new Client({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
    });

    // Set environment variables for hub.pull to work
    if (config.apiKey) {
      process.env.LANGSMITH_API_KEY = config.apiKey;
    }
    // Set the endpoint - for EU users it should be https://eu.api.smith.langchain.com
    if (config.apiUrl) {
      process.env.LANGSMITH_ENDPOINT = config.apiUrl;
    } else if (!process.env.LANGSMITH_ENDPOINT) {
      // Default to US endpoint if not specified
      process.env.LANGSMITH_ENDPOINT = "https://api.smith.langchain.com";
    }

    this.logger?.info("LangSmith client initialized", {
      apiUrl: config.apiUrl || "https://api.smith.langchain.com",
      workspace: config.workspace,
    });
  }

  /**
   * Pulls a prompt from LangSmith by name using the hub module.
   * @param promptName - The name of the prompt (e.g., "my-prompt" or "owner/my-prompt")
   * @param options - Optional pull parameters
   * @returns Promise<Result<LangSmithPrompt, PersistenceError>>
   */
  async pullPrompt(
    promptName: string,
    options?: LangSmithPullOptions,
  ): Promise<Result<LangSmithPrompt, PersistenceError>> {
    try {
      this.logger?.debug("Pulling prompt from LangSmith", {
        promptName,
        options,
      });

      // Use the hub.pull method from langchain/hub
      const prompt = await hub.pull<BasePromptTemplate>(promptName, options);

      // Cast to our extended type that includes metadata
      const runnablePrompt = prompt as LangSmithPromptTemplate;
      const metadata: LangSmithMetadata = runnablePrompt.metadata || {};
      const lc_kwargs = runnablePrompt.lc_kwargs || {};
      const version =
        options?.version ||
        (typeof metadata.version === "string" ? metadata.version : null) ||
        (typeof lc_kwargs.version === "string" ? lc_kwargs.version : null) ||
        "latest";

      this.logger?.info("Successfully pulled prompt from LangSmith hub", {
        promptName,
        promptType: prompt.constructor.name,
        inputVariables: prompt.inputVariables,
        hasPromptMessages: "promptMessages" in prompt,
        hasTemplate: "template" in prompt,
        metadata,
        version,
        lc_kwargs,
        runnableKeys: Object.keys(runnablePrompt),
      });

      // Transform the LangChain prompt to our internal format
      const transformedPrompt = this.transformLangChainPrompt(
        prompt,
        promptName,
        version,
      );

      this.logger?.info("Transformed LangChain prompt to LangSmith format", {
        transformedPrompt,
      });

      return Result.success(transformedPrompt);
    } catch (error) {
      this.logger?.error("Failed to pull prompt from LangSmith", {
        promptName,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error occurred while pulling prompt";

      return Result.failure(
        new PersistenceError(`Failed to pull prompt: ${errorMessage}`),
      );
    }
  }

  /**
   * Type guard to check if a prompt is a ChatPromptTemplate
   */
  private isChatPromptTemplate(
    prompt: BasePromptTemplate,
  ): prompt is ChatPromptTemplate {
    return (
      "promptMessages" in prompt &&
      Array.isArray((prompt as ChatPromptTemplate).promptMessages)
    );
  }

  /**
   * Type guard to check if a prompt is a simple PromptTemplate
   */
  private isPromptTemplate(
    prompt: BasePromptTemplate,
  ): prompt is PromptTemplate {
    return (
      "template" in prompt &&
      typeof (prompt as PromptTemplate).template === "string"
    );
  }

  /**
   * Transform a LangChain prompt template to our internal format.
   * @param prompt - The prompt from LangChain hub
   * @param promptName - The name of the prompt
   * @param version - The version of the prompt
   * @returns LangSmithPrompt
   */
  private transformLangChainPrompt(
    prompt: BasePromptTemplate,
    promptName: string,
    version: string = "latest",
  ): LangSmithPrompt {
    // Extract template content based on prompt type
    let template: string | LangSmithMessage[];
    let inputVariables: string[] = [];

    // Check if it's a ChatPromptTemplate
    if (this.isChatPromptTemplate(prompt)) {
      const chatPrompt = prompt as ChatPromptTemplate;

      // For now, we'll extract the first message template
      // In a chat prompt, we typically have a system message
      if (chatPrompt.promptMessages.length > 0) {
        const firstMessage = chatPrompt.promptMessages[0];

        this.logger?.info("Examining first prompt message", {
          hasPrompt: "prompt" in firstMessage,
          hasContent: "content" in firstMessage,
          hasTemplate: "template" in firstMessage,
          constructorName: firstMessage.constructor.name,
          keys: Object.keys(firstMessage),
        });

        // Check if it's a message prompt template with a prompt property
        if (
          "prompt" in firstMessage &&
          typeof firstMessage.prompt === "object"
        ) {
          const messageTemplate =
            firstMessage as MessagePromptWithNestedTemplate;
          if (messageTemplate.prompt) {
            this.logger?.info("Found prompt property in message", {
              promptKeys: Object.keys(messageTemplate.prompt),
              hasTemplate: "template" in messageTemplate.prompt,
              templateType: typeof messageTemplate.prompt.template,
            });

            if (messageTemplate.prompt.template) {
              // This is a string template
              template = messageTemplate.prompt.template;
              // Also extract input variables from the prompt
              if (messageTemplate.prompt.inputVariables) {
                inputVariables = messageTemplate.prompt.inputVariables;
              }
            }
          } else {
            template = "";
          }
        } else if (
          "content" in firstMessage &&
          typeof firstMessage === "object"
        ) {
          // This is a BaseMessage with direct content
          const baseMsg = firstMessage as BaseMessage;
          template =
            typeof baseMsg.content === "string"
              ? baseMsg.content
              : JSON.stringify(baseMsg.content);
        } else {
          // Fallback: try to get any template string
          template = "";
        }
      } else {
        template = "";
      }
    } else if (this.isPromptTemplate(prompt)) {
      // Simple PromptTemplate
      const simplePrompt = prompt as PromptTemplate;
      template =
        typeof simplePrompt.template === "string"
          ? simplePrompt.template
          : JSON.stringify(simplePrompt.template);
    } else {
      // Fallback for unknown prompt types
      this.logger?.warn("Unknown prompt type, using empty template", {
        promptName,
        promptType: prompt.constructor.name,
      });
      template = "";
    }

    // Extract input variables - this is on the base class
    if (prompt.inputVariables && Array.isArray(prompt.inputVariables)) {
      inputVariables = prompt.inputVariables as string[];
    }

    // Generate a unique ID based on the prompt name
    const id = `langsmith-${promptName.replace(/\//g, "-")}`;

    // Use the properly typed interface
    const promptWithMeta = prompt as LangSmithPromptTemplate;
    const promptMetadata: LangSmithMetadata = promptWithMeta.metadata || {};
    const lc_kwargs = promptWithMeta.lc_kwargs || {};

    // Merge all metadata sources with proper typing
    const mergedMetadata: LangSmithMetadata = {
      ...lc_kwargs,
      ...promptMetadata,
      tags:
        promptMetadata.tags ||
        (Array.isArray(lc_kwargs.tags) ? lc_kwargs.tags : []),
      version,
      source: "langsmith",
      promptName,
    };

    return {
      id,
      name: promptName,
      description:
        (typeof promptMetadata.description === "string"
          ? promptMetadata.description
          : null) ||
        (typeof lc_kwargs.description === "string"
          ? lc_kwargs.description
          : null) ||
        `Prompt pulled from LangSmith: ${promptName}`,
      object: "prompt",
      template,
      input_variables: inputVariables,
      metadata: mergedMetadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Lists all prompts - currently not supported.
   * The hub module doesn't provide a list operation.
   * @param limit - Maximum number of prompts
   * @param offset - Pagination offset
   * @returns Promise<Result<LangSmithPrompt[], PersistenceError>>
   */
  async listPrompts(
    limit?: number,
    offset?: number,
  ): Promise<Result<LangSmithPrompt[], PersistenceError>> {
    this.logger?.debug("Listing prompts from LangSmith", {
      limit,
      offset,
    });

    // The hub module doesn't support listing prompts
    // This would require direct API access or a different approach
    return Result.failure(
      new PersistenceError(
        "Listing prompts is not supported through the hub module. Prompts must be pulled by name.",
      ),
    );
  }

  /**
   * Lists all versions of a specific prompt - currently not supported.
   * @param promptName - The name of the prompt
   * @returns Promise<Result<LangSmithPrompt[], PersistenceError>>
   */
  async listPromptVersions(
    promptName: string,
  ): Promise<Result<LangSmithPrompt[], PersistenceError>> {
    this.logger?.debug("Listing prompt versions from LangSmith", {
      promptName,
    });

    // Version listing would require direct API access
    // The hub module pulls specific versions but doesn't list them
    return Result.failure(
      new PersistenceError(
        "Listing prompt versions is not directly supported. Use specific version tags when pulling prompts.",
      ),
    );
  }

  /**
   * Gets the underlying LangSmith client for advanced operations.
   * Use with caution - prefer the typed methods when possible.
   * @returns Client - The LangSmith client instance
   */
  getClient(): Client {
    return this.client;
  }
}
