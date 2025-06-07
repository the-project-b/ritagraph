// Query Discovery Node - Step 1: Discover Queries
// Your prompt: "You are a discovery assistant. Your task is to call the MCP server to get the list of all available GraphQL queries."

import { Command } from "@langchain/langgraph";
import client from "../../../mcp/client.js";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";

interface QueryInfo {
  name: string;
  signature: string;
  description: string;
}

/**
 * Query Discovery Node - Discovers and caches available GraphQL queries
 */
export const queryDiscoveryNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'query_discovery_start', { startTime });

  try {
    // Check cache first (5 minute cache)
    const cached = state.memory?.get('cachedQueries');
    if (cached && (Date.now() - cached.timestamp) < 300000) {
      logEvent('info', AgentType.TOOL, 'using_cached_queries', { count: cached.queries.length });
      
      // Store in memory for next node
      const updatedMemory = new Map(state.memory || new Map());
      updatedMemory.set('discoveredQueries', cached.queries);
      
      return new Command({
        goto: "INTENT_MATCHING", // Continue to next step
        update: {
          messages: state.messages,
          memory: updatedMemory
        }
      });
    }

    logEvent('info', AgentType.TOOL, 'discovering_queries_via_mcp');
    
    const mcpTools = await client.getTools();
    console.log(
      `Dynamic Graph: Loaded ${mcpTools.length} MCP tools: ${mcpTools
        .map((tool) => tool.name)
        .join(", ")}`
    );
  
    const listQueriesTool = mcpTools.find(tool => 
      tool.name.includes('graphql-list-queries')
    );

    if (!listQueriesTool) {
      throw new Error('graphql-list-queries tool not found');
    }

    // Extract access token from state or config (same logic as toolNode.ts)
    const authUser =
      (config as any)?.user ||
      (config as any)?.langgraph_auth_user ||
      ((config as any)?.configurable && (config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;
    
    // Use state accessToken if available, otherwise fall back to auth token
    const accessToken = state.accessToken || authAccessToken;
    const args = accessToken ? { accessToken } : {};
    
    // Call MCP to get queries
    const result = await listQueriesTool.invoke(args);
    const queries = parseQueriesResult(result);
    
    logEvent('info', AgentType.TOOL, 'queries_discovered', { 
      count: queries.length,
      queryNames: queries.map(q => q.name).join(', ')
    });

    // Cache the result and store for next node
    const updatedMemory = new Map(state.memory || new Map());
    updatedMemory.set('cachedQueries', { queries, timestamp: Date.now() });
    updatedMemory.set('discoveredQueries', queries);

    return new Command({
      goto: "INTENT_MATCHING", // Continue to intent matching
      update: {
        messages: state.messages,
        memory: updatedMemory
      }
    });

  } catch (error) {
    logEvent('error', AgentType.TOOL, 'query_discovery_error', { error: error.message });
    throw new Error(`Query discovery failed: ${error.message}`);
  }
};

/**
 * Parse queries from MCP result into clean format
 */
function parseQueriesResult(result: any): QueryInfo[] {
  let text = '';
  if (typeof result === 'string') {
    text = result;
  } else if (result?.content) {
    text = Array.isArray(result.content) ? result.content[0]?.text || '' : result.content;
  } else {
    text = JSON.stringify(result);
  }
  
  const queries: QueryInfo[] = [];
  const lines = text.split('\n');
  
  console.log(`🔍 DISCOVERY NODE: Processing ${lines.length} lines`);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    
    // Handle both formats:
    // 1. Simple query name: "queryName"
    // 2. Full signature: "queryName(args): returnType"
    const match = trimmed.match(/^(\w+)(\([^)]*\))?\s*:\s*(.+)$/);
    if (match) {
      // Full signature format
      const [, name, args = '', returnType] = match;
      const query = {
        name,
        signature: `${name}${args}: ${returnType}`,
        description: `GraphQL query to get ${name}`
      };
      console.log('🔍 DISCOVERY NODE: Found query with signature:', query);
      queries.push(query);
    } else if (/^\w+$/.test(trimmed)) {
      // Simple query name format
      const query = {
        name: trimmed,
        signature: `${trimmed}: Any`, // Generic return type
        description: `GraphQL query to get ${trimmed}`
      };
      // console.log('🔍 Found simple query:', query);
      queries.push(query);
    } else {
      console.log('🔍 DISCOVERY NODE: Skipping line (no match):', trimmed);
    }
  }
  
  console.log(`🔍 DISCOVERY NODE: Total queries found: ${queries.length}`);
  return queries;
} 