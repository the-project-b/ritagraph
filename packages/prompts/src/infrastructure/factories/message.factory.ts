import {
  ChatMessage,
  MessageRole,
  MessageSpec,
} from "../../application/dto/chat-prompt.dto.js";

/**
 * Factory for creating chat messages.
 * Provides builder patterns and convenience methods for message creation.
 */
export class MessageFactory {
  // #region Factory Methods
  /**
   * Creates a system message.
   * @param content - Message content
   * @param tags - Optional tags
   * @returns ChatMessage - Created message
   */
  static createSystem(content: string, tags?: string[]): ChatMessage {
    return {
      role: "system",
      content,
      tags,
    };
  }

  /**
   * Creates a human/user message.
   * @param content - Message content
   * @param tags - Optional tags
   * @returns ChatMessage - Created message
   */
  static createHuman(content: string, tags?: string[]): ChatMessage {
    return {
      role: "human",
      content,
      tags,
    };
  }

  /**
   * Creates an AI/assistant message.
   * @param content - Message content
   * @param tags - Optional tags
   * @returns ChatMessage - Created message
   */
  static createAI(content: string, tags?: string[]): ChatMessage {
    return {
      role: "assistant",
      content,
      tags,
    };
  }

  /**
   * Creates a function message.
   * @param content - Message content
   * @param name - Function name
   * @param tags - Optional tags
   * @returns ChatMessage - Created message
   */
  static createFunction(
    content: string,
    name: string,
    tags?: string[],
  ): ChatMessage {
    return {
      role: "function",
      content,
      name,
      tags,
    };
  }

  /**
   * Creates a message from a specification.
   * @param spec - Message specification
   * @returns ChatMessage - Created message
   */
  static fromSpec(spec: MessageSpec): ChatMessage {
    if (spec.type === "prompt") {
      throw new Error(
        "Cannot create message from prompt spec without formatting",
      );
    }

    const role = this.mapTypeToRole(spec.type);
    return {
      role,
      content: spec.content,
      tags: spec.tags,
    };
  }
  // #endregion

  // #region Builder Pattern
  /**
   * Creates a message builder for fluent message construction.
   * @returns MessageBuilder - Builder instance
   */
  static builder(): MessageBuilder {
    return new MessageBuilder();
  }
  // #endregion

  // #region Helper Methods
  /**
   * Maps message type to role.
   * @param type - Message type
   * @returns MessageRole - Corresponding role
   */
  private static mapTypeToRole(
    type: "system" | "human" | "ai" | "assistant",
  ): MessageRole {
    return type === "ai" ? "assistant" : type;
  }

  /**
   * Validates a message has required fields.
   * @param message - Message to validate
   * @returns boolean - True if valid
   */
  static isValid(message: ChatMessage): boolean {
    return Boolean(
      message.role &&
        message.content &&
        ["system", "human", "assistant", "ai", "function"].includes(
          message.role,
        ),
    );
  }

  /**
   * Filters messages by tags.
   * @param messages - Messages to filter
   * @param includeTags - Tags that must be present
   * @param excludeTags - Tags that must not be present
   * @returns ChatMessage[] - Filtered messages
   */
  static filterByTags(
    messages: ChatMessage[],
    includeTags?: string[],
    excludeTags?: string[],
  ): ChatMessage[] {
    return messages.filter((message) => {
      if (!message.tags || message.tags.length === 0) {
        return true;
      }

      if (excludeTags && excludeTags.length > 0) {
        const hasExcludedTag = message.tags.some((tag) =>
          excludeTags.includes(tag),
        );
        if (hasExcludedTag) return false;
      }

      if (includeTags && includeTags.length > 0) {
        const hasRequiredTag = message.tags.some((tag) =>
          includeTags.includes(tag),
        );
        if (!hasRequiredTag) return false;
      }

      return true;
    });
  }

  /**
   * Extracts messages of a specific role.
   * @param messages - Messages to filter
   * @param role - Role to extract
   * @returns ChatMessage[] - Messages with specified role
   */
  static extractByRole(
    messages: ChatMessage[],
    role: MessageRole,
  ): ChatMessage[] {
    return messages.filter((msg) => msg.role === role);
  }

  /**
   * Creates a conversation from alternating human/AI messages.
   * @param exchanges - Array of [human, ai] message pairs
   * @returns ChatMessage[] - Conversation messages
   */
  static createConversation(exchanges: Array<[string, string]>): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const [human, ai] of exchanges) {
      messages.push(this.createHuman(human));
      messages.push(this.createAI(ai));
    }

    return messages;
  }
  // #endregion
}

/**
 * Builder for constructing chat messages fluently.
 */
export class MessageBuilder {
  private role: MessageRole = "system";
  private content: string = "";
  private tags: string[] = [];
  private name?: string;
  private additionalKwargs: Record<string, unknown> = {};

  /**
   * Sets the message role.
   * @param role - Message role
   * @returns MessageBuilder - Builder instance
   */
  withRole(role: MessageRole): MessageBuilder {
    this.role = role;
    return this;
  }

  /**
   * Sets the message content.
   * @param content - Message content
   * @returns MessageBuilder - Builder instance
   */
  withContent(content: string): MessageBuilder {
    this.content = content;
    return this;
  }

  /**
   * Adds tags to the message.
   * @param tags - Tags to add
   * @returns MessageBuilder - Builder instance
   */
  withTags(...tags: string[]): MessageBuilder {
    this.tags.push(...tags);
    return this;
  }

  /**
   * Sets the message name (for function messages).
   * @param name - Message name
   * @returns MessageBuilder - Builder instance
   */
  withName(name: string): MessageBuilder {
    this.name = name;
    return this;
  }

  /**
   * Adds additional kwargs.
   * @param kwargs - Additional properties
   * @returns MessageBuilder - Builder instance
   */
  withAdditionalKwargs(kwargs: Record<string, unknown>): MessageBuilder {
    this.additionalKwargs = { ...this.additionalKwargs, ...kwargs };
    return this;
  }

  /**
   * Builds the message.
   * @returns ChatMessage - Built message
   */
  build(): ChatMessage {
    return {
      role: this.role,
      content: this.content,
      tags: this.tags.length > 0 ? this.tags : undefined,
      name: this.name,
      additional_kwargs:
        Object.keys(this.additionalKwargs).length > 0
          ? this.additionalKwargs
          : undefined,
    };
  }
}
