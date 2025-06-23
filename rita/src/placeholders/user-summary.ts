import { PlaceholderResolver, PlaceholderContext } from "./types";
import { userService } from "../utils/user-service";

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
    console.log("UserService cache stats:", cacheStats);

    return `${userName} (${userEmail}) works at ${companyName} as a ${userRole}, they prefer speaking in ${userLanguage}`;
  },
};
