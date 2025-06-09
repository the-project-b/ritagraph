import { MultiServerMCPClient } from '@langchain/mcp-adapters';

import mcpServers from './servers/index.js';

class MCPClient {
  private client: MultiServerMCPClient;

  constructor() {
    this.client = new MultiServerMCPClient({
      // Global tool configuration options
      // Whether to throw on errors if a tool fails to load (optional, default: true)
      throwOnLoadError: true,
      // Whether to prefix tool names with the server name (optional, default: true)
      prefixToolNameWithServerName: false,
      // Optional additional prefix for tool names (optional, default: "mcp")
      additionalToolNamePrefix: '',
    
      mcpServers,
    });
  }

  async getTools(includeTools: string[] = []) {
    const tools = await this.client.getTools();
    return includeTools.length > 0 ? tools.filter((tool) => includeTools.includes(tool.name)) : tools;
  }
}

const client = new MCPClient();

export default client;
