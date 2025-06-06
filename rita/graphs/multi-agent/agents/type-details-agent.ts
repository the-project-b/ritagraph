import { ChatOpenAI } from "@langchain/openai";
import { Task } from "../types";
import client from "../../../mcp/client.js";
import { MergedAnnotation } from "../../../states/states";

/**
 * Creates a type details agent that specializes in GraphQL type introspection
 */
export async function createTypeDetailsAgent() {
  // Get available MCP tools
  const mcpTools = await client.getTools();
  console.log(
    `Type Details Agent: Loaded ${mcpTools.length} MCP tools: ${mcpTools
      .map((tool) => tool.name)
      .join(", ")}`
  );

  const typeDetailsTools = mcpTools.filter(tool => 
    tool.name.includes('graphql-get-type-details')
  );

  // Create LLM with tools bound
  const model = new ChatOpenAI({
    model: "gpt-4",
    temperature: 0,
  }).bindTools(typeDetailsTools);

  return {
    /**
     * Executes a type details task using appropriate MCP tools
     */
    async executeTask(task: Task, state: typeof MergedAnnotation.State, config: any) {
      try {
        // Extract access token from state or config
        const authUser =
          (config as any)?.user ||
          (config as any)?.langgraph_auth_user ||
          ((config as any)?.configurable && (config as any).configurable.langgraph_auth_user);
        const authAccessToken = authUser?.token;
        
        // Use state accessToken if available, otherwise fall back to auth token
        const accessToken = state.accessToken || authAccessToken;
        
        console.log("🔍 TYPE DETAILS AGENT - Starting task execution");
        console.log("🔍 TYPE DETAILS AGENT - Task:", task.description);
        console.log("🔍 TYPE DETAILS AGENT - Task type:", task.type);
        console.log("🔍 TYPE DETAILS AGENT - Using accessToken from:", state.accessToken ? "state" : "auth config");
        console.log("🔍 TYPE DETAILS AGENT - Access token available:", !!accessToken);

        // Use the enhanced MCP tool with auto-extraction
        let analysis: {
          typeNames: string[];
          includeRelatedTypes: boolean;
          reasoning: string;
        } = {
          typeNames: [],
          includeRelatedTypes: true,
          reasoning: 'Using MCP tool auto-extraction from task context'
        };

        // Try to extract specific type names from task description first
        const explicitTypeMatches = task.description.match(/[A-Z]\w*(?:Input|Type|Data|Result|Filter|Advanced)/g);
        if (explicitTypeMatches && explicitTypeMatches.length > 0) {
          analysis.typeNames = [...new Set(explicitTypeMatches)];
          analysis.reasoning = 'Extracted type names directly from task description';
        }

        console.log('🔍 TYPE DETAILS AGENT - Analysis result:', analysis);

        // Find the unified type details tool
        const tool = typeDetailsTools.find(t => t.name === 'graphql-get-type-details');
        if (!tool) {
          throw new Error('graphql-get-type-details tool not found');
        }

        // Prepare the input arguments - use auto-extraction if no explicit types found
        let toolArgs: any;
        if (analysis.typeNames.length > 0) {
          toolArgs = {
            typeNames: analysis.typeNames.join(','),
            includeRelatedTypes: analysis.includeRelatedTypes
          };
        } else {
          toolArgs = {
            autoExtractFromContext: JSON.stringify(task.context || {}),
            includeRelatedTypes: analysis.includeRelatedTypes
          };
        }

        // Execute the tool with access token if available
        const toolInvokeArgs = accessToken 
          ? { ...toolArgs, accessToken }
          : toolArgs;
        
        const logMessage = analysis.typeNames.length > 0 
          ? `explicit types: ${analysis.typeNames.join(', ')}`
          : 'auto-extraction from context';
        console.log('🔍 TYPE DETAILS AGENT - Requesting type details for:', logMessage);
        const result = await tool.invoke(toolInvokeArgs);
        
        console.log('🔍 TYPE DETAILS AGENT - Type details completed successfully');

        // Note: Additional nested type discovery is now handled by the MCP tool's includeRelatedTypes parameter

        // Truncate the result to avoid huge log messages
        const truncatedResult = typeof result === 'string' && result.length > 500 
          ? result.substring(0, 500) + '... [truncated for brevity]'
          : result;

        // Format the response
        const response = {
          success: true,
          task: task.description,
          data: {
            typeDetails: result, // Keep full result for other agents to use
            summary: `Successfully retrieved type details using enhanced MCP tool`,
            // Store truncated version for logging
            truncatedResult: truncatedResult
          },
          metadata: {
            toolUsed: 'graphql-get-type-details',
            typesAnalyzed: analysis.typeNames,
            reasoning: analysis.reasoning,
            includeRelatedTypes: toolArgs.includeRelatedTypes
          },
          executedAt: new Date().toISOString()
        };

        return response;
      } catch (error) {
        console.error('Error executing type details task:', error);
        return {
          success: false,
          error: error.message,
          data: {
            summary: `Type details retrieval failed: ${error.message}`,
            details: {
              errorType: error.name || 'UnknownError',
              errorMessage: error.message,
              errorStack: error.stack
            }
          },
          metadata: {
            taskId: task.id,
            type: task.type,
            error: error.stack
          }
        };
      }
    }
  };
}

// Note: Type extraction logic has been moved to the MCP tool for better reusability 