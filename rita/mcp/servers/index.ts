import { graphqlMCP } from './graphql.mcp.server.js';

// Export combined MCP server configurations
const mcpServers = {
  ...graphqlMCP,
};

export default mcpServers;
