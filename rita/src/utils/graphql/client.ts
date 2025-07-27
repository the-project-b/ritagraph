import { GraphQLClient } from "graphql-request";
import { getSdk } from "../../generated/graphql";

export function createGraphQLClient(accessToken: string) {
  const client = new GraphQLClient("http://localhost:3001/graphqlapi/schema", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const sdk = getSdk(client);

  return sdk;
}

export type GraphQLClientType = ReturnType<typeof createGraphQLClient>;
