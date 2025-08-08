import { createLogger } from "@the-project-b/logging";
import { PlaceholderResolver, PlaceholderContext } from "./types.js";
import { userService } from "../utils/user-service.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "PlaceholderManager",
  component: "user-summary",
});

export const userSummaryResolver: PlaceholderResolver = {
  name: "auto_user_summary",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    // This will demonstrate that even though we're calling multiple methods,
    // only one GraphQL request will be made thanks to caching
    const userName = await userService.getUserName(context);
    const companyName = await userService.getCompanyName(context);
    const companyId = await userService.getCompanyId(context);
    const userEmail = await userService.getUserEmail(context);
    const userRole = await userService.getUserRole(context);
    const userLanguage = await userService.getUserLanguage(context);

    // Log cache stats to show caching is working
    const cacheStats = userService.getCacheStats();
    logger.debug("UserService cache stats", {
      operation: "getUserSummary",
      cacheStats,
    });

    return `${userName} (${userEmail}) works at ${companyName} as a ${userRole}, they prefer speaking in ${userLanguage}`;
  },
};
