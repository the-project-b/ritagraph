// import { MultiServerMCPClient } from '@langchain/mcp-adapters';
// import client from './client.js'; // Use the existing single client

// // Since we have only one MCP server, we'll use tool filtering instead of separate clients
// // This is the recommended approach for your current setup

// // Helper function to get tools by category from the main client
// export async function getToolsByCategory() {
//   const allTools = await client.getTools();
  
//   return {
//     introspectionTools: allTools.filter((tool: any) => 
//       tool.name.includes('introspect') || 
//       tool.name.includes('schema') ||
//       tool.name.includes('get-current-user')
//     ),
//     queryTools: allTools.filter((tool: any) => 
//       tool.name.includes('execute-query') ||
//       (tool.name.includes('query') && !tool.name.includes('introspect')) ||
//       (!tool.name.includes('introspect') && 
//        !tool.name.includes('schema') &&
//        !tool.name.includes('mutation') &&
//        !tool.name.includes('get-current-user') &&
//        !tool.name.includes('update') &&
//        !tool.name.includes('create') &&
//        !tool.name.includes('delete'))
//     ),
//     mutationTools: allTools.filter((tool: any) => 
//       tool.name.includes('mutation') ||
//       tool.name.includes('update') ||
//       tool.name.includes('create') ||
//       tool.name.includes('delete') ||
//       tool.name.includes('with-approval')
//     )
//   };
// }

// export default client; // Export the main client for now 