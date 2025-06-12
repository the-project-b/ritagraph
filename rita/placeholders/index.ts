import { placeholderManager } from "./manager";
import { usernameResolver } from "./username";
import { companynameResolver } from "./companyname";
import { userSummaryResolver } from "./user-summary";
import { timestampResolver, dateResolver, timeResolver } from "./timestamp";
import { messageCountResolver, lastMessageResolver, conversationSummaryResolver } from "./conversation";
import { companyIdResolver } from "./companyId";
import { contractIdsResolver } from "./contractIds";

// Register all placeholder resolvers
placeholderManager.register(usernameResolver);
placeholderManager.register(companynameResolver);
placeholderManager.register(userSummaryResolver);
placeholderManager.register(timestampResolver);
placeholderManager.register(dateResolver);
placeholderManager.register(timeResolver);
placeholderManager.register(messageCountResolver);
placeholderManager.register(lastMessageResolver);
placeholderManager.register(conversationSummaryResolver);
placeholderManager.register(companyIdResolver);
placeholderManager.register(contractIdsResolver);

// Export the manager and types for use in other parts of the application
export { placeholderManager } from "./manager";
export type { PlaceholderResolver, PlaceholderContext, PlaceholderRegistry } from "./types";

console.log(`Registered ${placeholderManager.getRegisteredPlaceholders().length} placeholders: ${placeholderManager.getRegisteredPlaceholders().join(", ")}`); 