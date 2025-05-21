/* eslint-disable @typescript-eslint/no-non-null-assertion */
import dotenv from 'dotenv';

dotenv.config();

// Export the Graphql MCP server configuration
export const graphqlMCP = {
  graphql: {
    transport: 'sse' as const,
    url: process.env.GRAPHQL_MCP_ENDPOINT!,
    reconnect: {
      enabled: true,
      maxAttempts: 5,
      delayMs: 2000,
    },
  },
};
