import { GraphQLClient } from "graphql-request";
import { getSdk } from "../generated/graphql.js";

/**
 * Creates a GraphQL client with authentication
 * @param token - The authentication token
 * @returns GraphQL SDK instance
 */
export function createGraphQLClient(token: string) {
  const endpoint =
    process.env.PROJECTB_GRAPHQL_ENDPOINT || "http://localhost:3001/graphql";

  const client = new GraphQLClient(endpoint, {
    headers: {
      authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
    },
  });

  return getSdk(client);
}
