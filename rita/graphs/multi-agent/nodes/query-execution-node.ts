// Query Execution Node - Step 4: Execute Query
// Your prompt: "You are a GraphQL execution planner. You have: - The user's original request - The selected query and required parameters..."

import { Command } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import client from "../../../mcp/client.js";
import { placeholderManager } from "../../../placeholders/manager";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import { updateTaskResultInState } from "../tasks/tasks-handling";

/**
 * Query Execution Node - Generates and executes GraphQL queries
 */
export const queryExecutionNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.QUERY, 'query_execution_start', { startTime });

  try {
    // Get data from previous nodes
    const selectedQuery = state.memory?.get('selectedQuery');
    const userRequest = state.memory?.get('userRequest');
    
    if (!selectedQuery) {
      throw new Error('No selected query found. Intent matching node should run first.');
    }

    logEvent('info', AgentType.QUERY, 'executing_query', {
      queryName: selectedQuery.name,
      userRequest: userRequest?.substring(0, 100)
    });

    // Generate the GraphQL query
    const query = await generateQuery(selectedQuery, userRequest, state, config);
    
    // Execute the query
    const result = await executeQuery(query, state, config);
    
    // Format the result
    const formattedResult = formatGenericResult(result, selectedQuery.name, userRequest);
    
    logEvent('info', AgentType.QUERY, 'query_execution_completed', {
      queryName: selectedQuery.name,
      success: formattedResult.success
    });

    // Get current task and update its result
    const taskState = state.memory?.get('taskState');
    const currentTask = taskState?.tasks?.find((task: any) => task.status === 'in_progress');
    
    if (currentTask) {
      const updatedState = updateTaskResultInState(state, currentTask.id, formattedResult);
      
      // Format user message
      const userMessage = formattedResult.success && formattedResult.summary ? 
                         formattedResult.summary : 
                         `❌ Error: ${formattedResult.error || 'Unknown error occurred'}`;

      return new Command({
        goto: AgentType.SUPERVISOR,
        update: { 
          messages: [
            ...state.messages,
            new AIMessage({
              content: userMessage
            })
          ],
          memory: updatedState.memory
        }
      });
    } else {
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: { messages: state.messages }
      });
    }

  } catch (error) {
    logEvent('error', AgentType.QUERY, 'query_execution_error', { error: error.message });
    
    // Handle error case
    const taskState = state.memory?.get('taskState');
    const currentTask = taskState?.tasks?.find((task: any) => task.status === 'in_progress');
    
    const errorResult = {
      success: false,
      error: error.message,
      data: { summary: `Query execution failed: ${error.message}` }
    };
    
    if (currentTask) {
      const updatedState = updateTaskResultInState(state, currentTask.id, errorResult);
      
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: { 
          messages: [
            ...state.messages,
            new AIMessage({
              content: `❌ Error: ${error.message}`
            })
          ],
          memory: updatedState.memory
        }
      });
    } else {
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: { 
          messages: [
            ...state.messages,
            new AIMessage({
              content: `❌ Query Error: ${error.message}`
            })
          ]
        }
      });
    }
  }
};

/**
 * Generate GraphQL query using LLM with prepared data
 */
async function generateQuery(selectedQuery: any, userRequest: string, state: ExtendedState, config: any): Promise<string> {
  const model = new ChatOpenAI({ model: "gpt-4", temperature: 0 });

  // Check if we have type details (optional)
  const typeDetails = state.memory?.get('typeDetails');
  const typeDetailsText = typeDetails ? JSON.stringify(typeDetails) : 'No type details available';

  const prompt = `You are a GraphQL execution planner. You have:
- User's original request: "${userRequest}"
- Selected query: "${selectedQuery.name}"
- Query reasoning: "${selectedQuery.reason}"
- Type details: ${typeDetailsText}

Your task is to:
1. Construct the correct GraphQL query for "${selectedQuery.name}"
2. Fill in required variables if possible (use placeholders like {{auto_companyid}} for company ID)
3. Keep it simple and generic for any query type

SIMPLE QUERY GENERATION RULES:
- For "me" query: query { me { id email firstName lastName } }
- For "employees" query: query { employees(data: { companyId: "{{auto_companyid}}", conditionType: AND, pagination: { limit: 20 } }) { employees { id firstName lastName email status } pagination { limit } } }
- For other queries: query { ${selectedQuery.name} { id } }
- Always use basic scalar fields only
- Avoid complex nested objects
- Be generic and flexible for any query type

Generate ONLY the GraphQL query string (no explanations):`;

  const response = await model.invoke([new HumanMessage(prompt)]);
  let query = typeof response.content === 'string' ? response.content.trim() : '';
  
  // Clean up the query
  query = query.replace(/```graphql\n?/g, '').replace(/```\n?/g, '').trim();

  // Handle placeholder replacement
  try {
    const invokeObject = await placeholderManager.buildInvokeObject(query, { state: state as any, config });
    const mustachePlaceholders = query.match(/\{\{([^}]+)\}\}/g) || [];
    
    for (const placeholder of mustachePlaceholders) {
      const placeholderName = placeholder.slice(2, -2).trim();
      if (invokeObject[placeholderName]) {
        query = query.replace(new RegExp(`\\{\\{${placeholderName}\\}\\}`, 'g'), invokeObject[placeholderName]);
      }
    }
  } catch (error) {
    console.warn('🔍 Placeholder replacement failed:', error.message);
  }

  console.log('🔍 Generated query:', query);
  return query;
}

/**
 * Execute the GraphQL query via MCP
 */
async function executeQuery(query: string, state: ExtendedState, config: any): Promise<any> {
  const mcpTools = await client.getTools();
  const executeQueryTool = mcpTools.find(t => t.name === 'execute-query');
  
  if (!executeQueryTool) {
    throw new Error('execute-query tool not found');
  }

  // Get access token
  const authUser = (config as any)?.user || (config as any)?.langgraph_auth_user;
  const accessToken = state.accessToken || authUser?.token;
  const queryArgs = accessToken ? { query, accessToken } : { query };
  
  console.log('🔍 Executing query via MCP...');
  const result = await executeQueryTool.invoke(queryArgs);
  
  return result;
}

/**
 * Format execution result into user-friendly response (generic for any query)
 */
function formatGenericResult(result: any, selectedQuery: string, userRequest: string): any {
  try {
    const queryOutput = typeof result === 'string' ? JSON.parse(result) : result;
    const data = queryOutput.data;

    if (!data) {
      return {
        success: false,
        error: 'No data returned from query',
        data: { summary: 'Query returned no data' }
      };
    }

    // Generate generic summary based on query type
    let summary = '';
    const queryResult = data[selectedQuery];
    
    if (queryResult) {
      if (Array.isArray(queryResult)) {
        summary = `Retrieved ${queryResult.length} items from ${selectedQuery}`;
      } else if (typeof queryResult === 'object') {
        summary = `Retrieved ${selectedQuery} data successfully`;
      } else {
        summary = `Successfully executed ${selectedQuery} query`;
      }
    } else {
      // Handle nested results (like employees.employees)
      const nestedKeys = Object.keys(data);
      if (nestedKeys.length > 0) {
        const firstKey = nestedKeys[0];
        const firstValue = data[firstKey];
        
        if (Array.isArray(firstValue)) {
          summary = `Retrieved ${firstValue.length} items`;
        } else if (firstValue && typeof firstValue === 'object') {
          // Check for nested arrays (like employees.employees)
          const subKeys = Object.keys(firstValue);
          for (const subKey of subKeys) {
            if (Array.isArray(firstValue[subKey])) {
              summary = `Retrieved ${firstValue[subKey].length} items from ${firstKey}`;
              break;
            }
          }
          if (!summary) {
            summary = `Retrieved ${firstKey} data successfully`;
          }
        } else {
          summary = `Successfully executed query`;
        }
      } else {
        summary = `Successfully executed ${selectedQuery} query`;
      }
    }

    return {
      success: true,
      task: userRequest,
      data: data,
      summary: summary,
      executedAt: new Date().toISOString()
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to parse result: ${error.message}`,
      data: { summary: 'Query result parsing failed' }
    };
  }
} 