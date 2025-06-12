// Intent Matching Node - Step 2: Match Query to Intent
// Your prompt: "Given the user's request... Choose the most appropriate query from the list that matches what the user wants to achieve."

import { Command } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import client from "../../../mcp/client.js";
import { builtInQueryManager } from "./built-in-queries.tool";
import { TaskState } from "../types";

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
  // Extract access token from state or config
  const authUser =
    (config as any)?.user ||
    (config as any)?.langgraph_auth_user ||
    ((config as any)?.configurable && (config as any).configurable.langgraph_auth_user);
  const authAccessToken = authUser?.token;
  const accessToken = state.accessToken || authAccessToken;

  const startTime = Date.now();
  logEvent('info', AgentType.TOOL, 'intent_matching_start', { startTime });

  try {
    // Get discovered queries from previous node
    const queries = state.memory?.get('discoveredQueries');
    if (!queries || typeof queries !== 'string') {
      throw new Error('No discovered queries found. Query discovery node should run first.');
    }

    // Get current task from state
    const taskState = state.memory?.get('taskState') as TaskState;
    if (!taskState) {
      throw new Error('No task state found');
    }

    const currentTaskIndex = taskState.tasks.findIndex(task => task.status === 'in_progress');
    const currentTask = taskState.tasks[currentTaskIndex];
    if (!currentTask) {
      throw new Error('No current task found');
    }

    // Use task description instead of original user request
    const userRequest = currentTask.description;
    if (!userRequest) {
      throw new Error('No task description found');
    }

    logEvent('info', AgentType.TOOL, 'matching_intent', { 
      userRequest: userRequest.substring(0, 100)
    });

    // Match intent using LLM
    let selectedQuery: IntentMatch | null = null;
    let selectedMutation: IntentMatch | null = null;
    if(currentTask.type === 'query') {
      selectedQuery = await matchQueryToIntent(userRequest, queries);
      
      // Check for built-in query handlers that bypass the normal pipeline
      const builtInResult = await builtInQueryManager.handleBuiltInQuery(state, config, userRequest, selectedQuery);
      if (builtInResult) {
        return builtInResult;
      }

      logEvent('info', AgentType.TOOL, 'intent_matched', {
        selectedQueryName: selectedQuery?.name,
        selectionReason: selectedQuery?.reason,
        skipSettings: selectedQuery?.skipSettings
      });

      // Get query details from MCP
      const mcpTools = await client.getTools();
      const getQueryDetailsTool = mcpTools.find(tool => 
        tool.name.includes('graphql-get-query-details')
      );

      if (!getQueryDetailsTool) {
        throw new Error('graphql-get-query-details tool not found');
      }

      try {
        // Execute query task
        const queryDetails = await getQueryDetailsTool.invoke({
          queryNames: selectedQuery?.name,
          accessToken
        });

        // Parse query details to extract types
        const detailsText = typeof queryDetails === 'string' ? queryDetails : JSON.stringify(queryDetails);
        console.log('🔍 INTENT MATCHING: Raw query details:', detailsText);

        // 1. queryName: returnType! (simple format)
        // 2. queryName(args): returnType! (with arguments)
        const simpleFormatMatch = detailsText.match(new RegExp(`${selectedQuery?.name}\\s*:\\s*([^!\\n]+)!?`));
        const argsFormatMatch = detailsText.match(new RegExp(`${selectedQuery?.name}\\s*\\(([^)]*)\\)\\s*:\\s*([^!\\n]+)!?`));
        
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
        updatedMemory.set('userRequest', userRequest);

        // Update current task with selected query data
        const updatedTaskState = { ...taskState };
        updatedTaskState.tasks[currentTaskIndex] = {
          ...currentTask,
          queryDetails: {
            selectedQueryName: selectedQuery?.name,
            selectionReason: selectedQuery?.reason,
            skipSettings: selectedQuery?.skipSettings,
            originalInputType: inputType,
            originalOutputType: outputType,
            rawQueryDetails: detailsText
          }
        };
        updatedMemory.set('taskState', updatedTaskState);

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
    } else if(currentTask.type === 'mutation') {
      // selectedMutation = await matchMutationToIntent(userRequest, queries);
    } else {
      throw new Error('Invalid task type');
    }
  } catch (error) {
    logEvent('error', AgentType.TOOL, 'intent_matching_error', { error: error.message });
    throw new Error(`Intent matching failed: ${error.message}`);
  }
};

/**
 * Match user intent to best query using LLM
 */
async function matchQueryToIntent(userRequest: string, queries: string): Promise<IntentMatch> {
  const model = new ChatOpenAI({ model: "gpt-4.1-mini", temperature: 0 });

  const prompt = `Given the user's request: "${userRequest}"
And the following available GraphQL queries:

${queries}

Your task is to select ONE most appropriate query that matches the user's intent. The queries are listed one per line, with some being simple names and others having more detailed signatures.

RESPOND WITH A SINGLE JSON OBJECT:
{
  "name": "exact_query_name",
  "arguments": {},
  "reason": "why this query was chosen"
}

INTENT MATCHING RULES:
1. Select ONLY ONE query that best matches the user's intent
2. If the request contains multiple parts, choose the most important or first part
3. For user identity/profile requests, prefer queries like 'me' etc. We are not using 'authUser' currently.
4. For data about multiple items, look for plural forms (e.g., 'employees' for multiple employees)
5. For company-related requests, consider 'company', 'companies', etc.
6. If multiple queries match, choose the most specific one
7. If no exact match, choose the most semantically relevant query

EMPLOYEE QUERY PREFERENCES:
8. "employeesByCompany" returns data with contract information and we can use it to support other tasks where its needed
9. Only use "employee" (singular) when the request specifically mentions an employee ID and if we have contractId of this user
10. For any other request about "employees", "all employees", "show employees", etc. -> use "employees"

AVAILABLE EMPLOYEE SEARCH CAPABILITIES:
- "employees" query: searches by firstName, lastName, personalNumberPayroll, income components (use only for advanced filtering)
- "employee" query: requires specific employeeId (not for searching)
- "employeesByCompany" query: gets employees by company with contract data (PREFERRED for cases where we have companyId)
- "employeeSpaceEmployees" query: searches by employeeId, firstName, lastName (NOT email)

Example matches:
- "Who am I?" -> "me"
- "Show me all employees" -> "employees"
- "What's my company info?" -> "company"
- "Get my profile" -> "me"

IMPORTANT: 
- Only select a query that exists in the provided list
- Return exactly ONE JSON object, not multiple objects
- Do not include any additional text before or after the JSON object
- If the request has multiple parts, focus on the most important one
- Do not try to handle multiple queries in one response`;

  const response = await model.invoke([new HumanMessage(prompt)]);
  
  try {
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    
    // Try to extract a single valid JSON object from the response
    let match;
    try {
      // First try parsing the entire content
      match = JSON.parse(content);
    } catch (e) {
      // If that fails, try to extract a single JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        match = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON object found in response');
      }
    }
    
    // Validate the selected query exists in the string
    const queryExists = queries.includes(match.name);
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
export function getFallbackQuery(userRequest: string, queries: string): IntentMatch {
  const lowerRequest = userRequest.toLowerCase();
  
  // Simple keyword matching as fallback
  if (lowerRequest.includes('me') || lowerRequest.includes('my') || lowerRequest.includes('who am i')) {
    if (queries.includes('me')) {
      return { 
        name: 'me', 
        arguments: {}, 
        reason: 'Fallback: detected user identity request',
      };
    }
  }
  
  if (lowerRequest.includes('employee') || lowerRequest.includes('staff') || lowerRequest.includes('people')) {
    // IMPORTANT: Always prefer employeesByCompany over employees for better data
    if (queries.includes('employeesByCompany')) {
      return { 
        name: 'employeesByCompany', 
        arguments: {}, 
        reason: 'Fallback: detected employee request - using employeesByCompany for richer data with contracts',
      };
    }
    
    // Only fall back to employees if employeesByCompany is not available
    if (queries.includes('employees')) {
      return { 
        name: 'employees', 
        arguments: {}, 
        reason: 'Fallback: detected employee request - using employees as employeesByCompany not available',
      };
    }
  }

  if (lowerRequest.includes('company') || lowerRequest.includes('organization')) {
    if (queries.includes('company')) {
      return { 
        name: 'company', 
        arguments: {}, 
        reason: 'Fallback: detected company request',
      };
    }
  }
  
  // Default to me query for identity-related requests
  if (queries.includes('me')) {
    return { 
      name: 'me', 
      arguments: {}, 
      reason: 'Fallback: defaulting to user identity query',
    };
  }
  
  // Default to first available query
  const firstQuery = queries.split('\n').find(line => line.trim() && !line.startsWith('#') && !line.startsWith('//'));
  return {
    name: firstQuery || 'me',
    arguments: {},
    reason: 'Fallback: using first available query',
  };
}
