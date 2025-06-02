import { PlaceholderResolver, PlaceholderContext } from "./types";
import { userService } from "../utils/user-service";

export const usernameResolver: PlaceholderResolver = {
  name: "auto_username",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return await userService.getUserName(context);
  },
};
