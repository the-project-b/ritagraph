import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

/**
 * Returns a formatted string of the last n messages with the assistant messages redacted.
 * Looking like:
 * | Role      | Message                    |
 * |-----------|----------------------------|
 * | User      | Hello, how are you?       |
 * | Assistant | [...]                      |
 * | User      | I'm good, thank you.      |
 * | Assistant | [...]                      |
 * | User      | What is your name?        |
 * | Assistant | [...]                      |
 * | User      | My name is John Doe.      |
 */
export function getConversationWithRedactedAssistantMessages(
  messages: Array<BaseMessage>,
  lastMessages: number = messages.length
) {
  return messages
    .filter(
      (message) =>
        message instanceof HumanMessage || message instanceof AIMessage
    )
    .map((message) => {
      if (message instanceof HumanMessage) {
        return `User: ${message.content}`;
      }
      return `Assistant: [...]`;
    })
    .slice(-lastMessages)
    .join("\n");
}

/**
 * Returns a formatted string of the last n messages.
 * Looking like:
 * | Role      | Message                    |
 * |-----------|----------------------------|
 * | User      | Hello, how are you?       |
 * | Assistant | I'm doing well, thank you! |
 * | User      | I'm good, thank you.      |
 * | Assistant | That's great to hear!      |
 * | User      | What is your name?        |
 * | Assistant | My name is Assistant.      |
 * | User      | My name is John Doe.      |
 */
export function getConversationMessages(
  messages: Array<BaseMessage>,
  lastMessages: number = messages.length
) {
  return messages
    .filter(
      (message) =>
        message instanceof HumanMessage || message instanceof AIMessage
    )
    .map((message) => {
      if (message instanceof HumanMessage) {
        return `User: ${message.content}`;
      }
      return `Assistant: ${message.content}`;
    })
    .slice(-lastMessages)
    .join("\n");
}
