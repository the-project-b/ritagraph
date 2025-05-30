import { PlaceholderResolver, PlaceholderContext } from "./types";
import { graphqlClient } from "../utils/graphql-client.js";
import { ME_QUERY, MeResponse } from "../utils/graphql-queries.js";

export const usernameResolver: PlaceholderResolver = {
  name: "auto_username",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    try {
      const response = await graphqlClient.request<MeResponse>(
        ME_QUERY,
        {},
        context,
      );

      return `${response.me.firstName} ${response.me.lastName}`;
    } catch (error) {
      console.warn("Failed to fetch username, using fallback:", error.message);
      return "John Doe";
    }
  },
};
