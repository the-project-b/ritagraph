import { Result } from "../../shared/types/result.js";
import { CreateChatPromptUseCase } from "../../application/use-cases/create-chat-prompt.use-case.js";
import {
  ChatMessage,
  ChatPromptResponse,
  MessageRole,
  MessageSpec,
} from "../../application/dto/chat-prompt.dto.js";
import { Logger } from "@the-project-b/logging";

/**
 * Interface that mimics LangChain's ChatPromptTemplate.
 */
export interface LangChainCompatibleChatPrompt {
  invoke: (values?: Record<string, unknown>) => Promise<LangChainMessage[]>;
  formatMessages?: (
    values: Record<string, unknown>,
  ) => Promise<LangChainMessage[]>;
  inputVariables?: string[];
}

/**
 * Interface for LangChain message format.
 */
export interface LangChainMessage {
  content: string;
  role?: string;
  name?: string;
  additional_kwargs?: Record<string, unknown>;
}

/**
 * Adapter to provide LangChain ChatPromptTemplate compatibility.
 * Bridges between our domain-driven chat system and LangChain's expectations.
 */
export class LangChainChatAdapter {
  private readonly logger: Logger;

  constructor(
    private readonly createChatUseCase: CreateChatPromptUseCase,
    logger?: Logger,
  ) {
    this.logger = logger || new Logger({ service: "langchain-chat-adapter" });
  }

  // #region Template Creation
  /**
   * Creates a LangChain-compatible chat prompt from message specifications.
   * @param messages - Array of message specifications or tuples
   * @returns Promise<LangChainCompatibleChatPrompt> - LangChain-compatible chat prompt
   */
  async fromMessages(
    messages: Array<
      | [string, string]
      | MessageSpec
      | { role: string; content: string; tags?: string[] }
    >,
  ): Promise<LangChainCompatibleChatPrompt> {
    this.logger.debug("Creating LangChain-compatible chat prompt", {
      messageCount: messages.length,
    });

    const messageSpecs = this.convertMessages(messages);
    const inputVariables = this.extractInputVariables(messageSpecs);

    return {
      invoke: async (values?: Record<string, unknown>) => {
        const result = await this.createChatUseCase.execute({
          messages: this.substituteVariables(messageSpecs, values || {}),
        });

        if (Result.isFailure(result)) {
          const error = Result.unwrapFailure(result);
          this.logger.error("Failed to create chat prompt", {
            error: error.message,
          });
          throw error;
        }

        const chatResponse = Result.unwrap(result);
        return this.toLangChainMessages(chatResponse.messages);
      },
      formatMessages: async (values: Record<string, unknown>) => {
        const result = await this.createChatUseCase.execute({
          messages: this.substituteVariables(messageSpecs, values),
        });

        if (Result.isFailure(result)) {
          throw Result.unwrapFailure(result);
        }

        return this.toLangChainMessages(Result.unwrap(result).messages);
      },
      inputVariables,
    };
  }

  /**
   * Creates from a ChatPromptResponse.
   * @param chatResponse - The chat prompt response
   * @returns LangChainCompatibleChatPrompt - LangChain-compatible chat prompt
   */
  fromChatResponse(
    chatResponse: ChatPromptResponse,
  ): LangChainCompatibleChatPrompt {
    return {
      invoke: async () => this.toLangChainMessages(chatResponse.messages),
      formatMessages: async () =>
        this.toLangChainMessages(chatResponse.messages),
      inputVariables: [],
    };
  }
  // #endregion

  // #region Message Conversion
  /**
   * Converts various message formats to our MessageSpec format.
   * @param messages - Array of messages in various formats
   * @returns MessageSpec[] - Normalized message specifications
   */
  private convertMessages(
    messages: Array<
      | [string, string]
      | MessageSpec
      | { role: string; content: string; tags?: string[] }
    >,
  ): MessageSpec[] {
    return messages.map((message) => {
      // Tuple format: ["system", "content"]
      if (Array.isArray(message)) {
        const [role, content] = message;
        return this.roleToMessageSpec(role, content);
      }

      // Already a MessageSpec
      if ("type" in message) {
        return message as MessageSpec;
      }

      // Object with role
      if ("role" in message) {
        return {
          ...this.roleToMessageSpec(message.role, message.content),
          tags: message.tags,
        } as MessageSpec;
      }

      throw new Error(`Unsupported message format: ${JSON.stringify(message)}`);
    });
  }

  /**
   * Converts role string to MessageSpec.
   * @param role - The role string
   * @param content - The message content
   * @returns MessageSpec - Message specification
   */
  private roleToMessageSpec(role: string, content: string): MessageSpec {
    switch (role.toLowerCase()) {
      case "system":
        return { type: "system", content };
      case "human":
      case "user":
        return { type: "human", content };
      case "ai":
      case "assistant":
        return { type: "ai", content };
      default:
        return { type: "system", content };
    }
  }

  /**
   * Converts our ChatMessage format to LangChain message format.
   * @param messages - Array of our chat messages
   * @returns LangChainMessage[] - LangChain format messages
   */
  private toLangChainMessages(messages: ChatMessage[]): LangChainMessage[] {
    return messages.map((message) => ({
      content: message.content,
      role: this.mapRole(message.role),
      name: message.name,
      additional_kwargs: message.additional_kwargs || {
        tags: message.tags,
      },
    }));
  }

  /**
   * Maps our MessageRole to LangChain role string.
   * @param role - Our message role
   * @returns string - LangChain role
   */
  private mapRole(role: MessageRole): string {
    switch (role) {
      case "system":
        return "system";
      case "human":
        return "human";
      case "ai":
      case "assistant":
        return "assistant";
      case "function":
        return "function";
      default:
        return "system";
    }
  }
  // #endregion

  // #region Variable Handling
  /**
   * Extracts input variables from message content.
   * @param messages - Array of message specifications
   * @returns string[] - Variable names found in content
   */
  private extractInputVariables(messages: MessageSpec[]): string[] {
    const variables = new Set<string>();
    const pattern = /\{(\w+)\}/g;

    for (const message of messages) {
      if ("content" in message) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(message.content)) !== null) {
          variables.add(match[1]);
        }
      }
    }

    return Array.from(variables);
  }

  /**
   * Substitutes variables in message content.
   * @param messages - Array of message specifications
   * @param values - Variable values to substitute
   * @returns MessageSpec[] - Messages with substituted values
   */
  private substituteVariables(
    messages: MessageSpec[],
    values: Record<string, unknown>,
  ): MessageSpec[] {
    return messages.map((message) => {
      if ("content" in message && typeof message.content === "string") {
        let content = message.content;
        for (const [key, value] of Object.entries(values)) {
          const pattern = new RegExp(`\\{${key}\\}`, "g");
          content = content.replace(pattern, String(value));
        }
        return { ...message, content };
      }
      return message;
    });
  }
  // #endregion

  // #region Migration Helpers
  /**
   * Migrates LangChain ChatPromptTemplate to our format.
   * @param messages - LangChain message array
   * @returns ChatPromptResponse - Our chat prompt format
   */
  static async migrate(
    messages: Array<[string, string] | { role: string; content: string }>,
  ): Promise<ChatPromptResponse> {
    const messageSpecs: MessageSpec[] = messages.map((msg) => {
      if (Array.isArray(msg)) {
        const [role, content] = msg;
        return LangChainChatAdapter.prototype.roleToMessageSpec.call(
          null,
          role,
          content,
        );
      }
      return LangChainChatAdapter.prototype.roleToMessageSpec.call(
        null,
        msg.role,
        msg.content,
      );
    });

    const chatMessages: ChatMessage[] = messageSpecs.map((spec) => {
      if (spec.type === "prompt") {
        throw new Error("Cannot migrate prompt references directly");
      }
      return {
        role: spec.type === "ai" ? "assistant" : (spec.type as MessageRole),
        content: spec.content,
        tags: spec.tags,
      };
    });

    return {
      messages: chatMessages,
      metadata: {
        messageCount: chatMessages.length,
        language: "EN",
        tags: [],
        timestamp: new Date(),
        promptsUsed: [],
      },
    };
  }
  // #endregion
}
