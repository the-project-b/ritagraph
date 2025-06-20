import { PlaceholderResolver, PlaceholderContext } from "./types";
import { userService } from "../utils/user-service";

export const companynameResolver: PlaceholderResolver = {
  name: "auto_companyname",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return await userService.getCompanyName(context);
  },
};
