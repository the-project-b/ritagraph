import { PlaceholderResolver, PlaceholderContext } from "./types";

export const usernameResolver: PlaceholderResolver = {
  name: "auto_username",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    // TODO: Logic to resolve the username
    return "John Doe";
  }
}; 