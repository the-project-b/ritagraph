import { placeholderManager } from "./manager";
import { usernameResolver } from "./username";
import { timestampResolver, dateResolver, timeResolver } from "./timestamp";
import { messageCountResolver, lastMessageResolver, conversationSummaryResolver } from "./conversation";

// Register all placeholder resolvers
placeholderManager.register(usernameResolver);
placeholderManager.register(timestampResolver);
placeholderManager.register(dateResolver);
placeholderManager.register(timeResolver);
placeholderManager.register(messageCountResolver);
placeholderManager.register(lastMessageResolver);
placeholderManager.register(conversationSummaryResolver);

// Export the manager and types for use in other parts of the application
export { placeholderManager } from "./manager";
export type { PlaceholderResolver, PlaceholderContext, PlaceholderRegistry } from "./types";

console.log(`Registered ${placeholderManager.getRegisteredPlaceholders().length} placeholders: ${placeholderManager.getRegisteredPlaceholders().join(", ")}`); 