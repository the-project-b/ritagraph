// Intent Matching Node - Step 2: Match Query to Intent
// Your prompt: "Given the user's request... Choose the most appropriate query from the list that matches what the user wants to achieve."

import { Command } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import client from "../../../mcp/client.js";

interface SkipSettings {
  skipDiscovery?: boolean;
  skipIntentMatching?: boolean;
  skipTypeDiscovery?: boolean;
  skipTypeProcessing?: boolean;
}

interface IntentMatch {
  name: string;
  arguments: any;
  reason: string;
  skipSettings?: SkipSettings;
}

/**
 * Intent Matching Node - Matches user intent to best available query
 */
export const intentMatchingNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'intent_matching_start', { startTime });

  try {
    // Get discovered queries from previous node
    const queries = state.memory?.get('discoveredQueries');
    if (!queries || !Array.isArray(queries)) {
      throw new Error('No discovered queries found. Query discovery node should run first.');
    }

    // Get user's original request
    const userRequest = extractUserRequest(state);
    if (!userRequest) {
      throw new Error('No user request found in messages');
    }

    logEvent('info', AgentType.TOOL, 'matching_intent', { 
      userRequest: userRequest.substring(0, 100),
      availableQueries: queries.length
    });

    // Match intent using LLM
    const selectedQuery = await matchQueryToIntent(userRequest, queries);
    
    logEvent('info', AgentType.TOOL, 'intent_matched', {
      selectedQuery: selectedQuery.name,
      reason: selectedQuery.reason,
      skipSettings: selectedQuery.skipSettings
    });

    // Get query details from MCP
    const mcpTools = await client.getTools();
    const getQueryDetailsTool = mcpTools.find(tool => 
      tool.name.includes('graphql-get-query-details')
    );

    if (!getQueryDetailsTool) {
      throw new Error('graphql-get-query-details tool not found');
    }

    // Extract access token from state or config
    const authUser =
      (config as any)?.user ||
      (config as any)?.langgraph_auth_user ||
      ((config as any)?.configurable && (config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;
    const accessToken = state.accessToken || authAccessToken;

    // Execute query task
    const queryDetails = await getQueryDetailsTool.invoke({
      queryNames: selectedQuery.name,
      accessToken
    });

    // Parse query details to extract types
    try {
      // Handle text-based query details format
      const detailsText = typeof queryDetails === 'string' ? queryDetails : JSON.stringify(queryDetails);
      console.log('🔍 INTENT MATCHING: Raw query details:', detailsText);

      // Try to match both formats:
      // 1. queryName: returnType! (simple format)
      // 2. queryName(args): returnType! (with arguments)
      const simpleFormatMatch = detailsText.match(new RegExp(`${selectedQuery.name}\\s*:\\s*([^!\\n]+)!?`));
      const argsFormatMatch = detailsText.match(new RegExp(`${selectedQuery.name}\\s*\\(([^)]*)\\)\\s*:\\s*([^!\\n]+)!?`));
      
      let inputType = 'Unknown';
      let outputType = 'Unknown';

      if (argsFormatMatch) {
        // Format with arguments: queryName(args): returnType
        outputType = argsFormatMatch[2].trim();
        
        // Extract input type from args
        const argsText = argsFormatMatch[1];
        const inputTypeMatch = argsText.match(/([^:]+):\s*([^!]+)!?/);
        if (inputTypeMatch) {
          inputType = inputTypeMatch[2].trim();
        }
      } else if (simpleFormatMatch) {
        // Simple format: queryName: returnType
        outputType = simpleFormatMatch[1].trim();
      }

      console.log('🔍 INTENT MATCHING: Query details parsed:');
      console.log('  - Query Name:', selectedQuery.name);
      console.log('  - Input Type:', inputType);
      console.log('  - Output Type:', outputType);
      console.log('  - Raw Details:', detailsText);

      // Store result for next node with parsed types and skip settings
      const updatedMemory = new Map(state.memory || new Map());
      updatedMemory.set('selectedQuery', {
        ...selectedQuery,
        details: detailsText,
        inputType,
        outputType,
        signature: {
          name: selectedQuery.name,
          input: inputType !== 'Unknown' ? {
            type: inputType,
            required: true
          } : undefined,
          output: {
            type: outputType,
            required: true
          }
        },
        skipSettings: selectedQuery.skipSettings || {
          skipDiscovery: false,
          skipIntentMatching: false,
          skipTypeDiscovery: false,
          skipTypeProcessing: false
        }
      });
      updatedMemory.set('userRequest', userRequest);

      return new Command({
        goto: "TYPE_DISCOVERY", // Continue to type discovery
        update: {
          messages: state.messages,
          memory: updatedMemory
        }
      });
    } catch (error) {
      console.error('🔍 INTENT MATCHING: Failed to parse query details:', error);
      throw new Error(`Failed to parse query details: ${error.message}`);
    }

  } catch (error) {
    logEvent('error', AgentType.TOOL, 'intent_matching_error', { error: error.message });
    throw new Error(`Intent matching failed: ${error.message}`);
  }
};

/**
 * Extract user's original request from messages
 */
function extractUserRequest(state: ExtendedState): string | null {
  const humanMessages = state.messages.filter(msg => 
    msg.constructor.name === 'HumanMessage'
  );
  
  const lastHuman = humanMessages[humanMessages.length - 1];
  return typeof lastHuman?.content === 'string' ? lastHuman.content : null;
}

/**
 * Match user intent to best query using LLM
 */
async function matchQueryToIntent(userRequest: string, queries: any[]): Promise<IntentMatch> {
  const model = new ChatOpenAI({ model: "gpt-4", temperature: 0 });

  const prompt = `Given the user's request: "${userRequest}"
And the following available GraphQL queries:

${queries.map(q => `- ${q.name}${q.signature || ''}: ${q.description || 'GraphQL query'}`).join('\n')}

Choose the most appropriate query from the list that matches what the user wants to achieve. Provide:
1. The query name
2. Any arguments it requires  
3. A brief reason for the choice
4. Skip settings for workflow steps

RESPOND WITH JSON:
{
  "name": "exact_query_name",
  "arguments": {},
  "reason": "why this query was chosen",
  "skipSettings": {
    "skipDiscovery": boolean,    // Skip query discovery step
    "skipIntentMatching": boolean, // Skip intent matching step
    "skipTypeDiscovery": boolean,  // Skip type discovery step
    "skipTypeProcessing": boolean  // Skip type processing step
  }
}

INTENT MATCHING RULES:
- For user identity queries ("who am I?", "my info", "user info", "me", "my profile") -> use "me" query
- For employee queries ("employees", "staff", "people", "list employees") -> use "employees" query
- For company queries ("company", "organization", "my company") -> use "company" query
- For user's company queries ("my companies", "companies I belong to") -> use "userToCompanies" query
- For employee data queries ("my employee data", "my employee info") -> use "employeeMyData" query
- Match keywords to query names exactly as shown above
- Be generic and flexible for any query type
- If multiple queries match, choose the most specific one

SKIP SETTINGS RULES:
- Set skipDiscovery=true if the query is already known and cached
- Set skipIntentMatching=true if the query is explicitly specified
- Set skipTypeDiscovery=true if type information is already available
- Set skipTypeProcessing=true if type processing is not needed`;

  const response = await model.invoke([new HumanMessage(prompt)]);
  
  try {
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    const match = JSON.parse(content);
    
    // Validate the selected query exists
    const queryExists = queries.some(q => q.name === match.name);
    if (!queryExists) {
      console.warn(`Selected query "${match.name}" not found, using fallback`);
      return getFallbackQuery(userRequest, queries);
    }
    
    return match;
  } catch (error) {
    console.warn('Intent matching failed, using fallback:', error.message);
    return getFallbackQuery(userRequest, queries);
  }
}

/**
 * Fallback logic for when LLM intent matching fails
 */
function getFallbackQuery(userRequest: string, queries: any[]): IntentMatch {
  const lowerRequest = userRequest.toLowerCase();
  
  // Simple keyword matching as fallback
  if (lowerRequest.includes('me') || lowerRequest.includes('my') || lowerRequest.includes('who am i')) {
    const meQuery = queries.find(q => q.name === 'me');
    if (meQuery) {
      return { 
        name: 'me', 
        arguments: {}, 
        reason: 'Fallback: detected user identity request',
        skipSettings: {
          skipDiscovery: false,
          skipIntentMatching: false,
          skipTypeDiscovery: false,
          skipTypeProcessing: false
        }
      };
    }
  }
  
  if (lowerRequest.includes('employee') || lowerRequest.includes('staff') || lowerRequest.includes('people')) {
    const employeesQuery = queries.find(q => q.name === 'employees');
    if (employeesQuery) {
      return { 
        name: 'employees', 
        arguments: {}, 
        reason: 'Fallback: detected employee request',
        skipSettings: {
          skipDiscovery: false,
          skipIntentMatching: false,
          skipTypeDiscovery: false,
          skipTypeProcessing: false
        }
      };
    }
  }

  if (lowerRequest.includes('company') || lowerRequest.includes('organization')) {
    const companyQuery = queries.find(q => q.name === 'company');
    if (companyQuery) {
      return { 
        name: 'company', 
        arguments: {}, 
        reason: 'Fallback: detected company request',
        skipSettings: {
          skipDiscovery: false,
          skipIntentMatching: false,
          skipTypeDiscovery: false,
          skipTypeProcessing: false
        }
      };
    }
  }
  
  // Default to me query for identity-related requests
  const meQuery = queries.find(q => q.name === 'me');
  if (meQuery) {
    return { 
      name: 'me', 
      arguments: {}, 
      reason: 'Fallback: defaulting to user identity query',
      skipSettings: {
        skipDiscovery: false,
        skipIntentMatching: false,
        skipTypeDiscovery: false,
        skipTypeProcessing: false
      }
    };
  }
  
  // Default to first available query
  return {
    name: queries[0].name,
    arguments: {},
    reason: 'Fallback: using first available query',
    skipSettings: {
      skipDiscovery: false,
      skipIntentMatching: false,
      skipTypeDiscovery: false,
      skipTypeProcessing: false
    }
  };
} 