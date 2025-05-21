/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { ToolCall } from '@langchain/core/messages/tool';
import { RunnableConfig } from '@langchain/core/runnables';
import { Command, interrupt } from '@langchain/langgraph';

import { MergedAnnotation } from '../states/states.js';

/**
 * Call the interrupt function to pause the graph and handle user interaction.
 * Once resumed, it will log the type of action which was returned from
 * the interrupt function.
 */
async function humanReviewNode(
  _state: typeof MergedAnnotation.State,
  _config: RunnableConfig
): Promise<Command> {
  const lastMessage = _state.messages[_state.messages.length - 1] as AIMessage;
  const toolCall = lastMessage.tool_calls![lastMessage.tool_calls!.length - 1];

  const humanReview = interrupt<
    {
      question: string;
      toolCall: ToolCall;
    },
    {
      action: string;
      data: any;
    }
  >({
    question: 'Is this correct?',
    toolCall,
  });

  const reviewAction = humanReview.action;
  const reviewData = humanReview.data;

  if (reviewAction === 'continue') {
    return new Command({ goto: 'run_tool' });
  } else if (reviewAction === 'update') {
    const toolMessage = new ToolMessage({
      name: toolCall.name,
      content: JSON.stringify({
        message: 'Updated arguments by human',
        originalArgs: toolCall.args,
        updatedArgs: reviewData,
      }),
      tool_call_id: toolCall.id!,
    });

    return new Command({
      goto: 'call_llm',
      update: { messages: [toolMessage] },
    });
  } else if (reviewAction === 'feedback') {
    const toolMessage = new ToolMessage({
      name: toolCall.name,
      content: reviewData,
      tool_call_id: toolCall.id!,
    });
    return new Command({
      goto: 'call_llm',
      update: { messages: [toolMessage] },
    });
  }
  throw new Error('Invalid review action');
}

export { humanReviewNode };
