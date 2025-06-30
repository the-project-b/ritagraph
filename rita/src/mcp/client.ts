import { MultiServerMCPClient } from "@langchain/mcp-adapters";

import mcpServers from "./servers/index.js";
import { buildGraphqlMCP } from "./servers/graphql.mcp.server.js";

const client = new MultiServerMCPClient({
  // Global tool configuration options
  // Whether to throw on errors if a tool fails to load (optional, default: true)
  throwOnLoadError: true,
  // Whether to prefix tool names with the server name (optional, default: true)
  prefixToolNameWithServerName: false,
  // Optional additional prefix for tool names (optional, default: "mcp")
  additionalToolNamePrefix: "",

  mcpServers,
});

export default client;

export const createMcpClient = (accessToken: string) => {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);

  return new MultiServerMCPClient({
    // Global tool configuration options
    // Whether to throw on errors if a tool fails to load (optional, default: true)
    throwOnLoadError: true,
    // Whether to prefix tool names with the server name (optional, default: true)
    prefixToolNameWithServerName: false,
    // Optional additional prefix for tool names (optional, default: "mcp")
    additionalToolNamePrefix: "",
    mcpServers: {
      ...buildGraphqlMCP(headers),
    },
  });
};
