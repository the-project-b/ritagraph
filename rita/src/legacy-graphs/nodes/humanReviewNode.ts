/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { ToolCall } from "@langchain/core/messages/tool";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { Command, interrupt } from "@langchain/langgraph";

import { MergedAnnotation } from "../states/states.js";

interface HumanReviewNodeConfig {
  customQuestion?: string;
  allowedActions?: ("continue" | "update" | "feedback")[];
}

const createHumanReviewNode = () => {
  /**
   * Call the interrupt function to pause the graph and handle user interaction.
   * Once resumed, it will log the type of action which was returned from
   * the interrupt function.
   */
  return async function humanReviewNode(
    _state: typeof MergedAnnotation.State,
    _config: LangGraphRunnableConfig<HumanReviewNodeConfig>
  ): Promise<Command> {
    const lastMessage = _state.messages[
      _state.messages.length - 1
    ] as AIMessage;
    const toolCall =
      lastMessage.tool_calls![lastMessage.tool_calls!.length - 1];

    console.log("toolCall", toolCall);

    // Use custom question if provided, otherwise use default
    const question = _config.configurable?.customQuestion || "Is this correct?";
    const allowedActions = _config.configurable?.allowedActions || [
      "continue",
      "update",
      "feedback",
    ];

    // Since we only reach here for tools with 'with-approval', no need to check
    // All tools reaching this node require human approval
    const humanReview = interrupt<
      {
        question: string;
        toolCall: ToolCall;
        allowedActions: string[];
      },
      {
        action: string;
        data: any;
      }
    >({
      question,
      toolCall,
      allowedActions,
    });

    const reviewAction = humanReview.action;
    const reviewData = humanReview.data;

    // Validate that the action is allowed
    if (!allowedActions.includes(reviewAction as any)) {
      throw new Error(
        `Invalid review action: ${reviewAction}. Allowed actions: ${allowedActions.join(
          ", "
        )}`
      );
    }

    if (reviewAction === "continue") {
      return new Command({ goto: "tool_node" });
    } else if (reviewAction === "update") {
      const toolMessage = new ToolMessage({
        name: toolCall.name,
        content: JSON.stringify({
          message: "Updated arguments by human",
          originalArgs: toolCall.args,
          updatedArgs: reviewData,
        }),
        tool_call_id: toolCall.id!,
      });

      return new Command({
        goto: "llm_node",
        update: { messages: [toolMessage] },
      });
    } else if (reviewAction === "feedback") {
      const toolMessage = new ToolMessage({
        name: toolCall.name,
        content: reviewData,
        tool_call_id: toolCall.id!,
      });
      return new Command({
        goto: "llm_node",
        update: { messages: [toolMessage] },
      });
    }
    throw new Error("Invalid review action");
  };
};

export { createHumanReviewNode, type HumanReviewNodeConfig };
