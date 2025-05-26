/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/// <reference types="node" />
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Command } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import client from "../mcp/client.js";
import { humanReviewNode } from "../nodes/humanReviewNode.js";
import { MergedAnnotation } from "../states/states.js";

// Handoff tool factory
function createHandoffTool(agentName: string, description: string) {
  return tool(
    async ({ reason }: { reason: string }) => {
      return `Transferring to ${agentName}: ${reason}`;
    },
    {
      name: `transfer_to_${agentName}`,
      description,
      schema: z.object({
        reason: z.string().describe("Reason for the transfer"),
      }),
    }
  );
}

const create_multi_agent_rita_graph = async () => {
  try {
    console.log("Initializing MCP client for multi-agent setup...");

    // Get all MCP tools
    const allMcpTools = await client.getTools();

    if (allMcpTools.length === 0) {
      throw new Error("No tools found");
    }

    console.log(
      `Loaded ${allMcpTools.length} MCP tools: ${allMcpTools
        .map((tool) => tool.name)
        .join(", ")}`
    );

    // Filter tools by category
    const introspectionTools = allMcpTools.filter(tool => 
      tool.name.includes('introspect') || 
      tool.name.includes('schema') ||
      tool.name.includes('get-current-user')
    );

    const queryTools = allMcpTools.filter(tool => 
      tool.name.includes('execute-query') ||
      tool.name.includes('query') ||
      !tool.name.includes('introspect') && 
      !tool.name.includes('schema') &&
      !tool.name.includes('mutation') &&
      !tool.name.includes('get-current-user')
    );

    const mutationTools = allMcpTools.filter(tool => 
      tool.name.includes('mutation') ||
      tool.name.includes('update') ||
      tool.name.includes('create') ||
      tool.name.includes('delete')
    );

    console.log(`Introspection tools: ${introspectionTools.map(t => t.name).join(", ")}`);
    console.log(`Query tools: ${queryTools.map(t => t.name).join(", ")}`);
    console.log(`Mutation tools: ${mutationTools.map(t => t.name).join(", ")}`);

    // Create handoff tools
    const transferToQueryAgent = createHandoffTool(
      "query_agent", 
      "Transfer to query agent for data retrieval operations"
    );
    const transferToMutationAgent = createHandoffTool(
      "mutation_agent", 
      "Transfer to mutation agent for data modification operations"
    );
    const transferToIntrospectionAgent = createHandoffTool(
      "introspection_agent", 
      "Transfer to introspection agent for schema analysis and user info"
    );

    // Models
    const cheapModel = new ChatOpenAI({
      model: 'gpt-3.5-turbo',
      temperature: 0,
    });

    const expensiveModel = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0,
    });

    // Create specialized agents with wrapper functions for proper routing
    const introspectionAgentCore = createReactAgent({
      llm: expensiveModel,
      tools: [...introspectionTools, transferToQueryAgent, transferToMutationAgent],
      prompt: `You are an introspection specialist agent. Your role is to:
1. Get current user information using get-current-user tool
2. Introspect GraphQL schemas
3. Analyze data structures and relationships
4. Transfer to other agents when they need to perform queries or mutations

IMPORTANT: Always start by getting current user info if not already available.
When users ask for data retrieval, transfer to query_agent.
When users ask for data modifications, transfer to mutation_agent.`,
      name: "introspection_agent"
    });

    const queryAgentCore = createReactAgent({
      llm: cheapModel,
      tools: [...queryTools, transferToIntrospectionAgent, transferToMutationAgent],
      prompt: `You are a query specialist agent. Your role is to:
1. Execute GraphQL queries for data retrieval
2. Handle read-only operations
3. Transfer to introspection_agent if you need schema information
4. Transfer to mutation_agent for data modifications

NEVER perform mutations - always transfer those to mutation_agent.`,
      name: "query_agent"
    });

    const mutationAgentCore = createReactAgent({
      llm: expensiveModel,
      tools: [...mutationTools, transferToIntrospectionAgent, transferToQueryAgent],
      prompt: `You are a mutation specialist agent. Your role is to:
1. Execute GraphQL mutations for data modifications
2. Handle create, update, delete operations
3. Always require explicit user approval for mutations
4. Transfer to introspection_agent if you need schema information
5. Transfer to query_agent for data retrieval

CRITICAL: All mutations require human approval. Be extremely careful with data modifications.`,
      name: "mutation_agent"
    });

    // Supervisor agent
    const supervisorAgentCore = createReactAgent({
      llm: expensiveModel,
      tools: [transferToIntrospectionAgent, transferToQueryAgent, transferToMutationAgent],
      prompt: `You are a supervisor agent that routes requests to specialized agents:

1. introspection_agent: For schema analysis, user info, and data structure understanding
2. query_agent: For data retrieval and read operations  
3. mutation_agent: For data modifications (create, update, delete)

ROUTING RULES:
- Start with introspection_agent if user info or schema understanding is needed
- Use query_agent for reading/retrieving data
- Use mutation_agent for any data modifications
- Always explain what each agent will do before transferring`,
      name: "supervisor"
    });

    // Wrapper functions that handle routing
    const introspectionAgent = async (state: typeof MergedAnnotation.State, config: any) => {
      const result = await introspectionAgentCore.invoke(state, config);
      const lastMessage = result.messages[result.messages.length - 1] as AIMessage;
      
      if (lastMessage?.tool_calls?.length) {
        return new Command({
          goto: "tool_node",
          update: result
        });
      }
      
      return new Command({
        goto: END,
        update: result
      });
    };

    const queryAgent = async (state: typeof MergedAnnotation.State, config: any) => {
      const result = await queryAgentCore.invoke(state, config);
      const lastMessage = result.messages[result.messages.length - 1] as AIMessage;
      
      if (lastMessage?.tool_calls?.length) {
        return new Command({
          goto: "tool_node",
          update: result
        });
      }
      
      return new Command({
        goto: END,
        update: result
      });
    };

    const mutationAgent = async (state: typeof MergedAnnotation.State, config: any) => {
      const result = await mutationAgentCore.invoke(state, config);
      const lastMessage = result.messages[result.messages.length - 1] as AIMessage;
      
      if (lastMessage?.tool_calls?.length) {
        return new Command({
          goto: "tool_node",
          update: result
        });
      }
      
      return new Command({
        goto: END,
        update: result
      });
    };

    const supervisorAgent = async (state: typeof MergedAnnotation.State, config: any) => {
      const result = await supervisorAgentCore.invoke(state, config);
      const lastMessage = result.messages[result.messages.length - 1] as AIMessage;
      
      if (lastMessage?.tool_calls?.length) {
        return new Command({
          goto: "tool_node",
          update: result
        });
      }
      
      return new Command({
        goto: END,
        update: result
      });
    };

    // Custom tool execution node that handles handoffs
    const toolNode = async (
      state: typeof MergedAnnotation.State,
      config: any
    ) => {
      const user =
        config?.user ||
        config?.langgraph_auth_user ||
        (config?.configurable && config.configurable.langgraph_auth_user);
      const accessToken = user?.token;

      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      
      if (!lastMessage?.tool_calls?.length) {
        return { messages: [] };
      }

      const toolMessages: ToolMessage[] = [];

      for (const toolCall of lastMessage.tool_calls) {
        // Check if this is a handoff tool
        if (toolCall.name.startsWith('transfer_to_')) {
          const targetAgent = toolCall.name.replace('transfer_to_', '');
          const reason = toolCall.args.reason || 'No reason provided';
          
          toolMessages.push(
            new ToolMessage({
              content: `Successfully transferred to ${targetAgent}. Reason: ${reason}`,
              name: toolCall.name,
              tool_call_id: toolCall.id!,
            })
          );

          // Return command to transfer to the target agent
          return new Command({
            goto: targetAgent,
            update: { messages: state.messages.concat(toolMessages) }
          });
        }

        // Handle regular MCP tools
        const tool = allMcpTools.find((t) => t.name === toolCall.name);
        let toolResult = "";
        
        if (tool) {
          const toolArgs = { ...toolCall.args, accessToken: accessToken };
          try {
            const result = await tool.invoke(toolArgs);
            toolResult = typeof result === "string" ? result : JSON.stringify(result);
          } catch (e: any) {
            console.error(`Error invoking tool ${toolCall.name}:`, e);
            toolResult = `Error: ${e.message || JSON.stringify(e)}`;
          }
        } else {
          toolResult = "Tool not found.";
        }

        if (toolCall.id) {
          toolMessages.push(
            new ToolMessage({
              content: toolResult,
              name: toolCall.name,
              tool_call_id: toolCall.id,
            })
          );
        }
      }

      // Check if any tool requires approval
      const requiresApproval = lastMessage.tool_calls.some((toolCall) =>
        toolCall.name.includes("with-approval")
      );

      if (requiresApproval) {
        return new Command({
          goto: "human_review_node",
          update: { messages: toolMessages }
        });
      }

      // Return to supervisor by default
      return new Command({
        goto: "supervisor", 
        update: { messages: toolMessages }
      });
    };

    // Build the multi-agent workflow
    const workflow = new StateGraph(MergedAnnotation)
      .addNode("supervisor", supervisorAgent, {
        ends: ["introspection_agent", "query_agent", "mutation_agent", "tool_node", "human_review_node", END]
      })
      .addNode("introspection_agent", introspectionAgent, {
        ends: ["query_agent", "mutation_agent", "tool_node", "human_review_node", END]
      })
      .addNode("query_agent", queryAgent, {
        ends: ["introspection_agent", "mutation_agent", "tool_node", "human_review_node", END]
      })
      .addNode("mutation_agent", mutationAgent, {
        ends: ["introspection_agent", "query_agent", "tool_node", "human_review_node", END]
      })
      .addNode("tool_node", toolNode, {
        ends: ["supervisor", "introspection_agent", "query_agent", "mutation_agent"]
      })
      .addNode("human_review_node", humanReviewNode, {
        ends: ["tool_node", "supervisor"],
      })
      .addEdge(START, "supervisor");

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({ checkpointer: memory });

    graph.name = "Multi-Agent Rita";

    return graph;
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

export { create_multi_agent_rita_graph }; 