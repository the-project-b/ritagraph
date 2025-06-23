/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/// <reference types="node" />
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

import client from "../mcp/client.js";
import { createHumanReviewNode } from "../nodes/humanReviewNode.js";
import { createLlmNode } from "../nodes/llmNode.js";
import { createToolNode } from "../nodes/toolNode.js";
import { MergedAnnotation } from "../states/states.js";
import {
  createQuestionPromptNode,
  QuestionPromptNodeConfig,
} from "../nodes/questionPromptNode.js";
// Import placeholders to ensure they are registered
import "../placeholders/index.js";

const create_dynamic_graph = async () => {
  try {
    console.log("Initializing Dynamic Graph with MCP client...");

    // Get the tools (flattened array is the default now)
    const mcpTools = await client.getTools();

    if (mcpTools.length === 0) {
      throw new Error("No tools found");
    }

    console.log(
      `Dynamic Graph: Loaded ${mcpTools.length} MCP tools: ${mcpTools
        .map((tool) => tool.name)
        .join(", ")}`
    );

    const expensiveModelWithoutTools = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0,
    }); // No tools bound - this is for prompt entry only

    // Wrapper for questionPromptNode to handle config adaptation for system prompt extraction
    const dynamicPromptEntryNode = async (
      state: typeof MergedAnnotation.State,
      config: any
    ) => {
      // Extract the required configuration from the generic config
      const promptId =
        config?.configurable?.prompt_ids?.[0] || config?.configurable?.promptId;

      if (!promptId) {
        throw new Error(
          "promptId is required in configurable.prompt_ids[0] or configurable.promptId"
        );
      }

      // Create the properly typed config for questionPromptNode with system prompt extraction
      // Preserve all original config properties (including auth info) and only override configurable
      const typedConfig: LangGraphRunnableConfig<QuestionPromptNodeConfig> = {
        ...config,
        configurable: {
          ...config.configurable, // Preserve existing configurable properties
          promptId,
          extractSystemPrompts: true, // Extract system prompts instead of generating messages
          model: expensiveModelWithoutTools,
        },
      };

      return questionPromptNode(state, typedConfig);
    };

    // Create the tool, LLM, and human review nodes using the modular functions
    const toolNode = createToolNode(mcpTools);
    const llmNode = createLlmNode(mcpTools);
    const humanReviewNode = createHumanReviewNode();
    const questionPromptNode = createQuestionPromptNode();

    // Routing logic - same as rita-v2 but with dynamic graph logging
    const routeAfterLLM = (
      state: typeof MergedAnnotation.State
    ): typeof END | "human_review_node" | "tool_node" | "llm_node" => {
      const lastMessage = state.messages[
        state.messages.length - 1
      ] as AIMessage;

      if (!lastMessage.tool_calls?.length) {
        console.log(
          "Dynamic Graph - No tool calls, staying in conversation loop"
        );
        return "llm_node";
      }

      // Check if any tool call requires approval (contains 'with-approval')
      const requiresApproval = lastMessage.tool_calls.some((toolCall) =>
        toolCall.name.includes("with-approval")
      );

      if (requiresApproval) {
        console.log(
          "Dynamic Graph - Tool requires approval, routing to human review"
        );
        return "human_review_node";
      } else {
        console.log(
          "Dynamic Graph - Tool doesn't require approval, executing directly"
        );
        return "tool_node";
      }
    };

    // Build the workflow - original intended flow
    const workflow = new StateGraph(MergedAnnotation)
      .addNode("dynamic_prompt_entry_llm_node", dynamicPromptEntryNode)
      .addNode("llm_node", llmNode)
      .addNode("tool_node", toolNode)
      .addNode("human_review_node", humanReviewNode, {
        ends: ["tool_node", "llm_node"],
      })
      .addEdge(START, "dynamic_prompt_entry_llm_node")
      .addEdge("dynamic_prompt_entry_llm_node", "llm_node")
      .addConditionalEdges("llm_node", routeAfterLLM, [
        "human_review_node",
        "tool_node",
        "llm_node",
        END,
      ])
      .addEdge("tool_node", "llm_node");

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({ checkpointer: memory });

    graph.name = "Dynamic Assistant";

    console.log("Dynamic Graph successfully created and compiled");

    return graph;
  } catch (error) {
    console.error("Dynamic Graph - Error:", error);
    process.exit(1); // Exit with error code
  }
};

export { create_dynamic_graph };
