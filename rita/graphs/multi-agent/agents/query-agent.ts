import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { Task } from "../types";
import client from "../../../mcp/client.js";

/**
 * Creates a query agent that uses MCP tools to execute query tasks
 */
export async function createQueryAgent() {
  // Get available MCP tools
  const mcpTools = await client.getTools();
  console.log(
    `Dynamic Graph: Loaded ${mcpTools.length} MCP tools: ${mcpTools
      .map((tool) => tool.name)
      .join(", ")}`
  );

  const queryTools = mcpTools.filter(tool => 
    // Filter for tools that are likely to be query-related
    tool.name.includes('graphql-list-queries') ||
    tool.name.includes('graphql-get-query-details') ||
    tool.name.includes('graphql-get-query-type-details') && 
    tool.name.includes('execute-query')
  );

  // Create LLM with tools bound
  const model = new ChatOpenAI({
    model: "gpt-4",
    temperature: 0,
  }).bindTools(queryTools);

  return {
    /**
     * Executes a query task using appropriate MCP tools
     */
    async executeTask(task: Task) {
      try {
        // Execute the task using the model with bound tools
        const response = await model.invoke([
          new HumanMessage(`Execute this query task: ${task.description}`)
        ]);

        // Extract tool calls from the response
        if (response.tool_calls?.length) {
          const toolCall = response.tool_calls[0];
          const tool = queryTools.find(t => t.name === toolCall.name);
          
          if (!tool) {
            throw new Error(`Tool ${toolCall.name} not found`);
          }

          // Execute the tool
          const result = await tool.invoke(toolCall.args);
          
          return {
            success: true,
            data: result,
            metadata: {
              taskId: task.id,
              type: task.type,
              toolUsed: tool.name,
              executionTime: new Date().toLocaleTimeString(),
              executionDate: new Date().toLocaleDateString()
            }
          };
        }

        // If no tool calls, return the response content
        return {
          success: true,
          data: response.content,
          metadata: {
            taskId: task.id,
            type: task.type,
            executionTime: new Date().toLocaleTimeString(),
            executionDate: new Date().toLocaleDateString()
          }
        };
      } catch (error) {
        console.error('Error executing query task:', error);
        return {
          success: false,
          error: error.message,
          data: {
            summary: `The retrieval was unsuccessful: ${error.message}`,
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