import { PlaceholderResolver, PlaceholderContext } from "./types";

export const messageCountResolver: PlaceholderResolver = {
  name: "message_count",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return context.state.messages.length.toString();
  }
};

export const lastMessageResolver: PlaceholderResolver = {
  name: "last_message",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    const lastMsg = context.state.messages[context.state.messages.length - 1];
    return lastMsg?.content?.toString() || "No messages";
  }
};

export const conversationSummaryResolver: PlaceholderResolver = {
  name: "conversation_summary",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    const messages = context.state.messages;
    if (messages.length === 0) return "No conversation yet";
    
    const messageTypes = messages.map(msg => msg._getType()).join(", ");
    return `Conversation with ${messages.length} messages (${messageTypes})`;
  }
}; 