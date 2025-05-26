import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import client from './client.js'; // Use the existing single client

// Since we have only one MCP server, we'll use tool filtering instead of separate clients
// This is the recommended approach for your current setup

// Helper function to get tools by category from the main client
export async function getToolsByCategory() {
  const allTools = await client.getTools();
  
  return {
    introspectionTools: allTools.filter((tool: any) => 
      tool.name.includes('introspect') || 
      tool.name.includes('schema') ||
      tool.name.includes('get-current-user')
    ),
    queryTools: allTools.filter((tool: any) => 
      tool.name.includes('execute-query') ||
      (tool.name.includes('query') && !tool.name.includes('introspect')) ||
      (!tool.name.includes('introspect') && 
       !tool.name.includes('schema') &&
       !tool.name.includes('mutation') &&
       !tool.name.includes('get-current-user') &&
       !tool.name.includes('update') &&
       !tool.name.includes('create') &&
       !tool.name.includes('delete'))
    ),
    mutationTools: allTools.filter((tool: any) => 
      tool.name.includes('mutation') ||
      tool.name.includes('update') ||
      tool.name.includes('create') ||
      tool.name.includes('delete') ||
      tool.name.includes('with-approval')
    )
  };
}

// If you want to set up multiple MCP servers in the future, here's how:
// 
// OPTION 1: Multiple instances of the same server with different configurations
// export const introspectionClient = new MultiServerMCPClient({
//   throwOnLoadError: true,
//   prefixToolNameWithServerName: false,
//   additionalToolNamePrefix: '',
//   mcpServers: {
//     'introspection-graphql': {
//       transport: 'sse' as const,
//       url: process.env.GRAPHQL_MCP_ENDPOINT + '?filter=introspection',
//       // You could add query parameters to filter tools server-side
//     }
//   },
// });
//
// OPTION 2: Completely separate MCP servers
// export const introspectionClient = new MultiServerMCPClient({
//   throwOnLoadError: true,
//   prefixToolNameWithServerName: false,
//   additionalToolNamePrefix: '',
//   mcpServers: {
//     'introspection-server': {
//       transport: 'sse' as const,
//       url: process.env.INTROSPECTION_MCP_SERVER_URL || 'http://localhost:3335/mcp',
//     }
//   },
// });

export default client; // Export the main client for now 