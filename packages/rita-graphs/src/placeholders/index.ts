import { createLogger } from "@the-project-b/logging";
import { placeholderManager } from "./manager.js";
import { usernameResolver } from "./username.js";
import { companynameResolver } from "./companyname.js";
import { userSummaryResolver } from "./user-summary.js";
import { timestampResolver, dateResolver, timeResolver } from "./timestamp.js";
import { messageCountResolver, lastMessageResolver, conversationSummaryResolver } from "./conversation.js";
import { companyIdResolver } from "./companyId.js";
import { contractIdsResolver } from "./contractIds.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "PlaceholderManager",
  component: "index",
});

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
export { placeholderManager } from "./manager.js";
export type { PlaceholderResolver, PlaceholderContext, PlaceholderRegistry } from "./types.js";

logger.info(`Registered ${placeholderManager.getRegisteredPlaceholders().length} placeholders: ${placeholderManager.getRegisteredPlaceholders().join(", ")}`, {
  operation: "registerPlaceholders",
  placeholderCount: placeholderManager.getRegisteredPlaceholders().length,
  placeholders: placeholderManager.getRegisteredPlaceholders(),
});