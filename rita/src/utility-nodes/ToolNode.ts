import {
  BaseMessage,
  ToolMessage,
  AIMessage,
  isBaseMessage,
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
//import { DynamicTool, StructuredToolInterface } from "@langchain/core/tools";
import {
  isCommand,
  isGraphInterrupt,
  MessagesAnnotation,
  Command,
  Send,
  END,
} from "@langchain/langgraph";
// Since we need to adjust the oringal ToolNode to work with a custom messageKey
import { RunnableCallable } from "../../node_modules/@langchain/langgraph/dist/utils";
import { ToolInterface } from "../graphs/shared-types/node-types";
//import { RunnableCallable } from "./tool-node-utils/utils";

// import { END, isCommand, Command, _isSend, Send } from "../constants.js";

export type ToolNodeOptions = {
  name?: string;
  tags?: string[];
  handleToolErrors?: boolean;
  messagesKey?: string;
};

type ToolsDefintion = ToolInterface[];

/**
 * ToolNode implementation based on https://github.com/langchain-ai/langgraphjs/blob/main/libs/langgraph/src/prebuilt/tool_node.ts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ToolNode<T = any> extends RunnableCallable<T, T> {
  tools: ToolsDefintion | (() => Promise<ToolsDefintion>);
  messagesKey: string;
  handleToolErrors = true;

  trace = false;

  constructor(
    tools: ToolsDefintion | (() => Promise<ToolsDefintion>),
    options?: ToolNodeOptions
  ) {
    const {
      name,
      tags,
      handleToolErrors,
      messagesKey = "messages",
    } = options ?? {};
    super({ name, tags, func: (input, config) => this.run(input, config) });
    this.tools = tools;
    this.handleToolErrors = handleToolErrors ?? this.handleToolErrors;
    this.messagesKey = messagesKey;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected async run(input: any, config: RunnableConfig): Promise<T> {
    const message = Array.isArray(input)
      ? input[input.length - 1]
      : input[this.messagesKey][input[this.messagesKey].length - 1];

    if (message?._getType() !== "ai") {
      throw new Error("ToolNode only accepts AIMessages as input.");
    }

    const outputs = await Promise.all(
      (message as AIMessage).tool_calls?.map(async (call) => {
        let fetchedTools: ToolsDefintion;
        if (typeof this.tools === "function") {
          fetchedTools = await this.tools();
        } else {
          fetchedTools = this.tools;
        }

        const tool = fetchedTools.find((tool) => tool.name === call.name);
        try {
          if (tool === undefined) {
            throw new Error(`Tool "${call.name}" not found.`);
          }
          const output = await tool.invoke(
            { ...call, type: "tool_call" },
            config
          );
          if (
            (isBaseMessage(output) && output._getType() === "tool") ||
            isCommand(output)
          ) {
            return output;
          } else {
            return new ToolMessage({
              name: tool.name,
              content:
                typeof output === "string" ? output : JSON.stringify(output),
              tool_call_id: call.id!,
            });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
          if (!this.handleToolErrors) {
            throw e;
          }
          if (isGraphInterrupt(e)) {
            // `NodeInterrupt` errors are a breakpoint to bring a human into the loop.
            // As such, they are not recoverable by the agent and shouldn't be fed
            // back. Instead, re-throw these errors even when `handleToolErrors = true`.
            throw e;
          }
          return new ToolMessage({
            content: `Error: ${e.message}\n Please fix your mistakes.`,
            name: call.name,
            tool_call_id: call.id ?? "",
          });
        }
      }) ?? []
    );

    // Preserve existing behavior for non-command tool outputs for backwards compatibility
    if (!outputs.some(isCommand)) {
      return (Array.isArray(input) ? outputs : { messages: outputs }) as T;
    }

    // Handle mixed Command and non-Command outputs
    const combinedOutputs: (
      | { [key: string]: BaseMessage[] }
      | BaseMessage[]
      | Command
    )[] = [];
    let parentCommand: Command | null = null;

    for (const output of outputs) {
      if (isCommand(output)) {
        if (
          output.graph === Command.PARENT &&
          Array.isArray(output.goto) &&
          output.goto.every((send) => _isSend(send))
        ) {
          if (parentCommand) {
            (parentCommand.goto as Send[]).push(...(output.goto as Send[]));
          } else {
            parentCommand = new Command({
              graph: Command.PARENT,
              goto: output.goto,
            });
          }
        } else {
          combinedOutputs.push(output);
        }
      } else {
        combinedOutputs.push(
          Array.isArray(input) ? [output] : { [this.messagesKey]: [output] }
        );
      }
    }

    if (parentCommand) {
      combinedOutputs.push(parentCommand);
    }

    return combinedOutputs as T;
  }
}

export function toolsCondition(
  state: BaseMessage[] | typeof MessagesAnnotation.State
): "tools" | typeof END {
  const message = Array.isArray(state)
    ? state[state.length - 1]
    : state[this.messagesKey][state[this.messagesKey].length - 1];

  if (
    "tool_calls" in message &&
    ((message as AIMessage).tool_calls?.length ?? 0) > 0
  ) {
    return "tools";
  } else {
    return END;
  }
}

// Mark: Type guards

export function _isSend(x: unknown): x is Send {
  // eslint-disable-next-line no-instanceof/no-instanceof
  return x instanceof Send;
}
