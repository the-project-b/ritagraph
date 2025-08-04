import { GraphQLClient } from "graphql-request";
import { getSdk, Sdk } from "../../generated/graphql";

export function createGraphQLClient(accessToken: string): Sdk {
  const client = new GraphQLClient(
    `${process.env.PROJECTB_GRAPHQL_ENDPOINT}/schema`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const sdk = getSdk(client);

  return sdk;
}

export type GraphQLClientType = ReturnType<typeof createGraphQLClient>;
