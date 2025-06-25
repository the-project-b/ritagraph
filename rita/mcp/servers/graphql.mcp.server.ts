/* eslint-disable @typescript-eslint/no-non-null-assertion */
import dotenv from 'dotenv';

dotenv.config();

// Export the Graphql MCP server configuration
export const graphqlMCP = {
  graphql: {
    // Use streamable HTTP transport; will automatically fall back to SSE if needed
    transport: 'http' as const,
    // Convert legacy /sse URLs to the streamable HTTP /mcp endpoint expected by the
    // HTTP transport. This keeps existing environment variables working across
    // dev and prod without manual changes.
    url: (() => {
      const raw = process.env.GRAPHQL_MCP_ENDPOINT!;
      if (raw.endsWith('/sse')) {
        return raw.replace(/\/sse$/, '/mcp');
      }
      return raw;
    })(),
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
    automaticSSEFallback: true,
    // Ensure Node.js EventSource implementation is used when we do fall back to SSE
    useNodeEventSource: true,
    reconnect: {
      enabled: true,
      maxAttempts: 5,
      delayMs: 2000,
    },
  },
};
