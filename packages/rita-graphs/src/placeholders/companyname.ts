import { PlaceholderResolver, PlaceholderContext } from "./types.js";
import { userService } from "../utils/user-service.js";

export const companynameResolver: PlaceholderResolver = {
  name: "auto_companyname",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return await userService.getCompanyName(context);
  },
};
