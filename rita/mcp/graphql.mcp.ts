import { loadMcpTools } from '@langchain/mcp-adapters';

import { initSseClient } from './clients/sse.js';

type InitGraphQLMCPClientOptions = {
  throwOnLoadError?: boolean;
  prefixToolNameWithServerName?: boolean;
  additionalToolNamePrefix?: string;
};

const initGraphQLMCPClient = async (
  sseEndpoint: string,
  options?: InitGraphQLMCPClientOptions
) => {
  const sseClient = await initSseClient(sseEndpoint);
  const mcpServerName = 'graphql-mcp-server';

  try {
    const tools = await loadMcpTools(mcpServerName, sseClient, {
      // Whether to throw errors if a tool fails to load (optional, default: true)
      throwOnLoadError: options?.throwOnLoadError ?? true,
      // Whether to prefix tool names with the server name (optional, default: false)
      prefixToolNameWithServerName:
        options?.prefixToolNameWithServerName ?? false,
      // Optional additional prefix for tool names (optional, default: "")
      additionalToolNamePrefix: options?.additionalToolNamePrefix ?? '',
    });

    return tools;
  } catch (error) {
    console.error(
      'Error while loading MCP tools',
      {
        mcpServer: {
          name: mcpServerName,
          endpoint: sseEndpoint,
        },
        error: error.message,
      },
      error.stack
    );
    await sseClient.close();
    throw error;
  }
};

export { initGraphQLMCPClient };
