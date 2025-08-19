import { GraphQLClient } from "graphql-request";
import { createLogger } from "@the-project-b/logging";
import { getSdk, Sdk } from "../../generated/graphql";
import { ToolContext } from "../../tools/tool-factory";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "GraphQLClient",
});

type GraphQLClientOverrides = {
  accessToken?: string;
  appdataHeader?: string;
};

/**
 * Creates a GraphQL client with authentication and optional impersonation context
 *
 * @param ctx - Tool context containing accessToken and optional appdataHeader, or a plain object with these properties
 * @param overrides - Optional overrides for accessToken or appdataHeader
 * @returns GraphQL SDK client configured with proper authentication headers
 *
 * @example
 * // Normal usage with tool context
 * const client = createGraphQLClient(ctx);
 *
 * @example
 * // Usage with overrides when you need to pass different credentials
 * const client = createGraphQLClient(ctx, {
 *   accessToken: 'different-token',
 *   appdataHeader: 'custom-appdata'
 * });
 */
export function createGraphQLClient(
  ctx: ToolContext | { accessToken: string; appdataHeader?: string },
  overrides?: GraphQLClientOverrides,
): Sdk {
  // Extract values from context, with overrides taking precedence
  const accessToken = overrides?.accessToken ?? ctx.accessToken;
  const appdataHeader = overrides?.appdataHeader ?? ctx.appdataHeader;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  // Pass the appdata header if available for impersonation context when we hit our backend, we pass the original value that was sent to us through the passthrough layer
  if (appdataHeader) {
    headers["X-Appdata"] = appdataHeader;
  }

  const client = new GraphQLClient(
    `${process.env.PROJECTB_GRAPHQL_ENDPOINT}`,
    {
      headers,
    },
  );
  
  // Create a custom wrapper that logs and handles errors
  const customWrapper = (
    action: any,
    operationName: string,
    operationType?: string,
    _variables?: any,
  ) => {
    return action().catch((error: any) => {
      logger.error(`GraphQL request failed`, error, {
        operationName,
        operationType,
        status: error.response?.status,
        errorMessage: error.message,
        hasToken: !!accessToken,
        tokenPrefix: `${accessToken?.substring(0, 20)}...`,
        endpoint: process.env.PROJECTB_GRAPHQL_ENDPOINT,
      });
      throw error;
    });
  };

  const sdk = getSdk(client, customWrapper);

  return sdk;
}

export type GraphQLClientType = ReturnType<typeof createGraphQLClient>;
