/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/// <reference types="node" />
import { AIMessage } from "@langchain/core/messages";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

// Import the text files directly
// import mcpFirstStepContent from "../prompts/hardcoded/mcp-first-step.ts";
// // import mcpEffectivenessContent from '../prompts/hardcoded/mcp-effectiveness.ts';
// import mcpInstructionsContent from "../prompts/hardcoded/mcp-instructions.ts";
// import mcpWorkingExamplesContent from "../prompts/hardcoded/mcp-working-examples.ts";

import client from "../mcp/client.js";
import { createHumanReviewNode } from "../nodes/humanReviewNode.js";
import { createLlmNode } from "../nodes/llmNode.js";
import { createToolNode } from "../nodes/toolNode.js";
import { MergedAnnotation } from "../states/states.js";

const create_rita_v2_graph = async () => {
  try {
    console.log("Initializing MCP client...");

    // Get the tools (flattened array is the default now)
    const mcpTools = await client.getTools();

    if (mcpTools.length === 0) {
      throw new Error("No tools found");
    }

    console.log(
      `Loaded ${mcpTools.length} MCP tools: ${mcpTools
        .map((tool) => tool.name)
        .join(", ")}`
    );

    // Create the tool, LLM, and human review nodes using the modular functions
    const toolNode = createToolNode(mcpTools);
    const llmNode = createLlmNode(mcpTools);
    const humanReviewNode = createHumanReviewNode();

    const routeAfterLLM = (
      state: typeof MergedAnnotation.State
    ): typeof END | "human_review_node" | "tool_node" => {
      const lastMessage = state.messages[
        state.messages.length - 1
      ] as AIMessage;

      if (!lastMessage.tool_calls?.length) {
        return END;
      }

      // Check if any tool call requires approval (contains 'with-approval')
      const requiresApproval = lastMessage.tool_calls.some((toolCall) =>
        toolCall.name.includes("with-approval")
      );

      if (requiresApproval) {
        return "human_review_node";
      } else {
        // Skip human review for tools that don't need approval
        return "tool_node";
      }
    };

    const workflow = new StateGraph(MergedAnnotation)
      .addNode("llm_node", llmNode)
      .addNode("tool_node", toolNode)
      .addNode("human_review_node", humanReviewNode, {
        ends: ["tool_node", "llm_node"],
      })
      .addEdge(START, "llm_node")
      .addConditionalEdges("llm_node", routeAfterLLM, [
        "human_review_node",
        "tool_node",
        END,
      ])
      .addEdge("tool_node", "llm_node");

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({ checkpointer: memory });

    graph.name = "Rita V2";

    return graph;
  } catch (error) {
    console.error("Error:", error);
    process.exit(1); // Exit with error code
  }
};

export { create_rita_v2_graph };
