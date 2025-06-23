// Query Discovery Node - Step 1: Discover Queries
// Your prompt: "You are a discovery assistant. Your task is to call the MCP server to get the list of all available GraphQL queries."

import { Command } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import client from "../../../mcp/client.js";
import { ExtendedState } from "../../../states/states.js";
import { AgentType } from "../types/agents.js";
import { logEvent } from "../agents/supervisor-agent.js";
import { safeCreateMemoryMap } from "../utils/memory-helpers.js";

/**
 * Query Discovery Node - Discovers and caches available GraphQL queries
 */
export const queryDiscoveryNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent("info", AgentType.TOOL, "query_discovery_start", { startTime });

  try {
    // Check cache first (5 minute cache)
    const cached = state.memory?.get("cachedQueries");
    if (cached && Date.now() - cached.timestamp < 300000) {
      logEvent("info", AgentType.TOOL, "using_cached_queries");

      // Store in memory for next node
      const updatedMemory = safeCreateMemoryMap(state.memory);
      updatedMemory.set("discoveredQueries", cached.queries);

      return new Command({
        goto: "INTENT_MATCHING", // Continue to next step
        update: {
          messages: state.messages,
          memory: updatedMemory,
        },
      });
    }

    logEvent("info", AgentType.TOOL, "discovering_queries_via_mcp");

    const mcpTools = await client.getTools();
    console.log(
      `Dynamic Graph: Loaded ${mcpTools.length} MCP tools: ${mcpTools
        .map((tool) => tool.name)
        .join(", ")}`
    );

    const listQueriesTool = mcpTools.find((tool) =>
      tool.name.includes("graphql-list-queries")
    );

    if (!listQueriesTool) {
      throw new Error("graphql-list-queries tool not found");
    }

    // Extract access token from state or config
    const authUser =
      (config as any)?.user ||
      (config as any)?.langgraph_auth_user ||
      ((config as any)?.configurable &&
        (config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;

    // Use state accessToken if available, otherwise fall back to auth token
    const accessToken = state.accessToken || authAccessToken;
    const args = accessToken ? { accessToken } : {};

    // Call MCP to get queries
    const queries = await listQueriesTool.invoke(args);

    logEvent("info", AgentType.TOOL, "queries_discovered");

    // Cache the result and store for next node
    const updatedMemory = safeCreateMemoryMap(state.memory);
    updatedMemory.set("cachedQueries", { queries, timestamp: Date.now() });
    updatedMemory.set("discoveredQueries", queries);

    return new Command({
      goto: "INTENT_MATCHING", // Continue to intent matching
      update: {
        messages: state.messages,
        memory: updatedMemory,
      },
    });
  } catch (error) {
    logEvent("error", AgentType.TOOL, "query_discovery_error", {
      error: error.message,
    });

    // CRITICAL FIX: Don't throw errors, mark task as failed and continue
    const taskState = state.memory?.get("taskState");
    const currentTaskIndex = taskState?.tasks.findIndex(
      (task) => task.status === "in_progress"
    );

    if (currentTaskIndex >= 0 && taskState) {
      const currentTask = taskState.tasks[currentTaskIndex];
      const updatedTaskState = {
        ...taskState,
        tasks: taskState.tasks.map((task) =>
          task.id === currentTask.id
            ? {
                ...task,
                status: "failed" as const,
                error: `Query discovery failed: ${error.message}`,
              }
            : task
        ),
        failedTasks: new Set([...taskState.failedTasks, currentTask.id]),
      };

      const updatedMemory = safeCreateMemoryMap(state.memory);
      updatedMemory.set("taskState", updatedTaskState);

      // Preserve userRequest
      const userRequest = state.memory?.get("userRequest");
      if (userRequest) {
        updatedMemory.set("userRequest", userRequest);
      }

      return new Command({
        goto: AgentType.SUPERVISOR,
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: `Failed to discover available queries: ${error.message}`,
            }),
          ],
          memory: updatedMemory,
        },
      });
    }

    // Fallback: if no task state, still don't throw
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: `Query discovery failed: ${error.message}`,
          }),
        ],
        memory: state.memory,
      },
    });
  }
};
