import { PlaceholderResolver, PlaceholderContext } from "./types.js";
import { userService } from "../utils/user-service.js";

export const companyIdResolver: PlaceholderResolver = {
  name: "auto_companyid",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return await userService.getCompanyId(context);
  },
};
