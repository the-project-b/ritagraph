// Mutation Discovery Node - Step 1: Discover Mutations
// Your prompt: "You are a discovery assistant. Your task is to call the MCP server to get the list of all available GraphQL mutations."

import { Command } from "@langchain/langgraph";
import client from "../../../mcp/client.js";
import { ExtendedState } from "../../../../states/states.js";
import { AgentType } from "../types/agents.js";
import { logEvent } from "../agents/supervisor-agent.js";
import { MutationInfo } from "./index";
import { safeCreateMemoryMap } from "../utils/memory-helpers.js";

/**
 * Mutation Discovery Node - Discovers and caches available GraphQL mutations
 */
export const mutationDiscoveryNode = async (
  state: ExtendedState,
  config: any
) => {
  const startTime = Date.now();
  logEvent("info", AgentType.MUTATION, "mutation_discovery_start", {
    startTime,
  });

  try {
    // Check cache first (5 minute cache)
    const cached = state.memory?.get("cachedMutations");
    if (cached && Date.now() - cached.timestamp < 300000) {
      logEvent("info", AgentType.MUTATION, "using_cached_mutations");

      // Store in memory for next node
      const updatedMemory = safeCreateMemoryMap(state.memory);
      updatedMemory.set("discoveredMutations", cached.mutations);

      return new Command({
        goto: "INTENT_MATCHING", // Continue to next step
        update: {
          messages: state.messages,
          memory: updatedMemory,
        },
      });
    }

    logEvent("info", AgentType.MUTATION, "discovering_mutations_via_mcp");

    const mcpTools = await client.getTools();
    console.log(
      `Dynamic Graph: Loaded ${mcpTools.length} MCP tools: ${mcpTools
        .map((tool) => tool.name)
        .join(", ")}`
    );

    const listMutationsTool = mcpTools.find((tool) =>
      tool.name.includes("graphql-list-mutations")
    );

    if (!listMutationsTool) {
      throw new Error("graphql-list-mutations tool not found");
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

    // Call MCP to get mutations
    const mutations = await listMutationsTool.invoke(args);

    logEvent("info", AgentType.MUTATION, "mutations_discovered", {
      count: mutations.length,
    });

    // Cache the result and store for next node
    const updatedMemory = safeCreateMemoryMap(state.memory);
    updatedMemory.set("cachedMutations", { mutations, timestamp: Date.now() });
    updatedMemory.set("discoveredMutations", mutations);

    // Update mutation context
    const mutationContext = state.memory?.get("mutationContext") || {};
    mutationContext.discoveredMutations = mutations;
    mutationContext.selectedMutation = null;
    mutationContext.typeDetails = null;
    mutationContext.generatedMutation = null;
    mutationContext.executionResult = null;
    updatedMemory.set("mutationContext", mutationContext);

    return new Command({
      goto: "INTENT_MATCHING", // Continue to intent matching
      update: {
        messages: state.messages,
        memory: updatedMemory,
      },
    });
  } catch (error) {
    logEvent("error", AgentType.MUTATION, "mutation_discovery_error", {
      error: error.message,
    });
    throw new Error(`Mutation discovery failed: ${error.message}`);
  }
};
