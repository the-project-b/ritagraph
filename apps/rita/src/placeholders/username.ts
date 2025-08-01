import { PlaceholderResolver, PlaceholderContext } from "./types.js";
import { userService } from "../utils/user-service.js";

export const usernameResolver: PlaceholderResolver = {
  name: "auto_username",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return await userService.getUserName(context);
  },
};
