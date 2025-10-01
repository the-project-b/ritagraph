import { Result, ValidationError, err, ok } from "@the-project-b/types";
import {
  type ConversationMessage,
  type ExampleInputs,
  type ExampleOutputs,
  type ExampleMetadata,
  ExampleInputsSchema,
  ExampleOutputsSchema,
  ExampleMetadataSchema,
  ConversationMessageSchema,
} from "../schemas/example.schemas.js";

/**
 * Example entity - represents a single dataset example
 * Supports both single-turn (question) and multi-turn (messages) formats
 */
export class Example {
  private constructor(
    public readonly id: string,
    public readonly inputs: ExampleInputs,
    public readonly outputs?: ExampleOutputs,
    public readonly metadata?: ExampleMetadata,
    public readonly splits?: string[],
    public readonly datasetId?: string,
    public readonly createdAt?: Date,
  ) {}

  /**
   * Creates an Example from LangSmith data
   */
  static create(props: {
    id: string;
    inputs: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    splits?: string[];
    split?: string; // Backwards compat
    datasetId?: string;
    createdAt?: Date;
  }): Result<Example, ValidationError> {
    if (!props.id) {
      return err(new ValidationError("Example ID is required"));
    }

    const inputsResult = ExampleInputsSchema.safeParse(props.inputs);
    if (!inputsResult.success) {
      const errors = inputsResult.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return err(new ValidationError(`Invalid example inputs: ${errors}`));
    }

    let outputs: ExampleOutputs | undefined;
    if (props.outputs) {
      const outputsResult = ExampleOutputsSchema.safeParse(props.outputs);
      if (!outputsResult.success) {
        const errors = outputsResult.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return err(new ValidationError(`Invalid example outputs: ${errors}`));
      }
      outputs = outputsResult.data;
    }

    let metadata: ExampleMetadata | undefined;
    if (props.metadata) {
      const metadataResult = ExampleMetadataSchema.safeParse(props.metadata);
      if (!metadataResult.success) {
        const errors = metadataResult.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return err(new ValidationError(`Invalid example metadata: ${errors}`));
      }
      metadata = metadataResult.data;
    }

    // Handle backward compatibility - if split is provided, convert to array
    // While LangSmith sucks and only does one split, we can prep our system to handle multiple splits for when they ever fix it and/or we move to LangFuse
    const splits = props.splits || (props.split ? [props.split] : undefined);

    return ok(
      new Example(
        props.id,
        inputsResult.data,
        outputs,
        metadata,
        splits,
        props.datasetId,
        props.createdAt,
      ),
    );
  }

  hasOutput(): boolean {
    return this.outputs !== undefined && Object.keys(this.outputs).length > 0;
  }

  getInputValue(key: string): unknown {
    return this.inputs[key];
  }

  getOutputValue(key: string): unknown {
    return this.outputs?.[key];
  }

  matchesSplit(split: string): boolean {
    return this.splits?.includes(split) || false;
  }

  hasSplits(): boolean {
    return this.splits !== undefined && this.splits.length > 0;
  }

  /**
   * Type guard to check if messages input is a valid ConversationMessage array
   * Uses Zod schema for validation
   */
  private isConversationMessageArray(
    value: unknown,
  ): value is ConversationMessage[] {
    const schema = ConversationMessageSchema.array().min(1);
    return schema.safeParse(value).success;
  }

  /**
   * Determines if this example is a multi-turn conversation
   * Multi-turn: Has messages array with 2+ messages
   * Single-turn: Has question field OR messages with 1 message
   */
  isMultiTurn(): boolean {
    if ("messages" in this.inputs) {
      const messages = this.inputs.messages;
      if (this.isConversationMessageArray(messages)) {
        return messages.length >= 2;
      }
    }

    return false;
  }

  /**
   * Gets the conversation messages if this is a multi-turn example
   * Returns null if not multi-turn or messages are invalid
   */
  getMessages(): ConversationMessage[] | null {
    if ("messages" in this.inputs) {
      const messages = this.inputs.messages;
      if (this.isConversationMessageArray(messages)) {
        return messages;
      }
    }

    return null;
  }

  /**
   * Gets the question if this is a single-turn example
   * Also handles backward compatibility: if messages array has 1 message, extract it
   */
  getQuestion(): string | null {
    // Direct question field
    if ("question" in this.inputs && typeof this.inputs.question === "string") {
      return this.inputs.question;
    }

    // Backward compat: single message in array
    if ("messages" in this.inputs) {
      const messages = this.inputs.messages;
      if (
        this.isConversationMessageArray(messages) &&
        messages.length === 1 &&
        messages[0].role === "user"
      ) {
        return messages[0].content;
      }
    }

    return null;
  }

  /**
   * Gets user messages from conversation (excludes assistant/system messages)
   */
  getUserMessages(): ConversationMessage[] {
    const messages = this.getMessages();
    if (!messages) {
      return [];
    }
    return messages.filter((msg) => msg.role === "user");
  }

  toJSON(): {
    id: string;
    inputs: ExampleInputs;
    outputs?: ExampleOutputs;
    metadata?: ExampleMetadata;
    splits?: string[];
    datasetId?: string;
    createdAt?: string;
  } {
    return {
      id: this.id,
      inputs: this.inputs,
      outputs: this.outputs,
      metadata: this.metadata,
      splits: this.splits,
      datasetId: this.datasetId,
      createdAt: this.createdAt?.toISOString(),
    };
  }
}
