// Type Discovery Node - Step 3: Analyze Input and Output Types
// Your prompt: "You are a GraphQL type analyzer. Your task is to discover and analyze the structure of input and output types for the selected query."

import { Command } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import client from "../../../mcp/client.js";
import { ExtendedState } from "../../../states/states.js";
import { AgentType } from "../types/agents.js";
import { logEvent } from "../agents/supervisor-agent.js";
import { Task } from "../types/index.js";

import { safeCreateMemoryMap } from "../utils/memory-helpers.js";

/**
 * Type Discovery Node - Fetches type details for the selected query
 */
export const typeDiscoveryNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent("info", AgentType.TOOL, "type_discovery_start", { startTime });

  try {
    // Get the selected query from state
    const taskState = state.memory?.get("taskState");

    if (!taskState) {
      throw new Error("No task state found");
    }

    const currentTaskIndex = taskState.tasks.findIndex(
      (task) => task.status === "in_progress"
    );
    const currentTask: Task = taskState.tasks[currentTaskIndex];
    if (!currentTask) {
      throw new Error("No current task found");
    }

    const selectedQuery = currentTask.queryDetails;
    if (!selectedQuery) {
      throw new Error(
        "No selected query found. Intent matching node should run first."
      );
    }

    logEvent("info", AgentType.TOOL, "discovering_types", {
      queryName: selectedQuery.selectedQueryName,
      inputType: selectedQuery.originalInputType,
      outputType: selectedQuery.originalOutputType,
    });

    // Get MCP tools
    const mcpTools = await client.getTools();
    const getTypeDetailsTool = mcpTools.find(
      (tool) => tool.name === "graphql-get-type-details"
    );

    if (!getTypeDetailsTool) {
      throw new Error("graphql-get-type-details tool not found");
    }

    // Extract access token from state or config
    const authUser =
      (config as any)?.user ||
      (config as any)?.langgraph_auth_user ||
      ((config as any)?.configurable &&
        (config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;
    const accessToken = state.accessToken || authAccessToken;

    // Collect all types to analyze
    const typesToAnalyze = new Set<string>();

    // If types are Unknown, use the query name itself
    if (
      selectedQuery.originalInputType === "Unknown" &&
      selectedQuery.originalOutputType === "Unknown"
    ) {
      typesToAnalyze.add(selectedQuery.selectedQueryName || "");
      logEvent("info", AgentType.TOOL, "using_query_name_as_type", {
        queryName: selectedQuery.selectedQueryName,
      });
    } else {
      // Clean up type names by removing array and non-nullable modifiers
      const cleanType = (type: string) => {
        return type
          .replace(/\[|\]/g, "") // Remove array brackets
          .replace(/!/g, "") // Remove non-nullable modifiers
          .trim();
      };

      if (selectedQuery.originalInputType) {
        typesToAnalyze.add(cleanType(selectedQuery.originalInputType));
      }
      if (selectedQuery.originalOutputType) {
        typesToAnalyze.add(cleanType(selectedQuery.originalOutputType));
      }
    }

    if (typesToAnalyze.size === 0) {
      throw new Error("No types to analyze found in selected query");
    }

    // Prepare type names for the tool
    const typeNames = Array.from(typesToAnalyze).join(",");
    console.log("🔍 TYPE DISCOVERY: Analyzing types:", typeNames);
    console.log("🔍 TYPE DISCOVERY: Original types:", {
      input: selectedQuery.originalInputType,
      output: selectedQuery.originalOutputType,
    });

    // Prepare tool parameters
    const toolParams = {
      typeNames,
      includeRelatedTypes: true,
      accessToken: accessToken || undefined,
    };

    console.log("🔍 TYPE DISCOVERY: Tool parameters:", toolParams);
    console.log("🔍 TYPE DISCOVERY: Calling getTypeDetailsTool...");

    // Call the tool to get type details
    let typeDetails = await getTypeDetailsTool.invoke(toolParams);
    console.log("🔍 TYPE DISCOVERY: Tool response received");

    // Validate type details response
    if (
      !typeDetails ||
      (typeof typeDetails === "string" &&
        typeDetails.includes("No types found"))
    ) {
      logEvent("warn", AgentType.TOOL, "no_types_found", {
        queryName: selectedQuery.selectedQueryName,
        typeNames,
      });

      // If we used the query name and got no results, try with the output type from signature
      if (
        selectedQuery.signature?.output?.type &&
        selectedQuery.signature.output.type !== "Unknown"
      ) {
        logEvent("info", AgentType.TOOL, "retrying_with_signature_type", {
          type: selectedQuery.signature.output.type,
        });

        const retryParams = {
          ...toolParams,
          typeNames: selectedQuery.signature.output.type,
        };

        const retryDetails = await getTypeDetailsTool.invoke(retryParams);
        if (
          retryDetails &&
          !(
            typeof retryDetails === "string" &&
            retryDetails.includes("No types found")
          )
        ) {
          typeDetails = retryDetails;
        }
      }
    }

    // Store the raw type details in the selected query
    const updatedMemory = safeCreateMemoryMap(state.memory);
    selectedQuery.rawTypeDetails = typeDetails;
    updatedMemory.set("taskState", taskState);

    // CRITICAL: Preserve userRequest for result formatting
    const userRequest = state.memory?.get("userRequest");
    if (userRequest) {
      updatedMemory.set("userRequest", userRequest);
      console.log("🔧 TYPE_DISCOVERY - Preserved userRequest:", userRequest);
    }

    logEvent("info", AgentType.TOOL, "type_discovery_completed", {
      queryName: selectedQuery.selectedQueryName,
      duration: Date.now() - startTime,
      typesFound:
        typeDetails &&
        !(
          typeof typeDetails === "string" &&
          typeDetails.includes("No types found")
        ),
    });

    // Continue to context gathering node
    return new Command({
      goto: "CONTEXT_GATHERING",
      update: {
        messages: state.messages,
        memory: updatedMemory,
      },
    });
  } catch (error) {
    logEvent("error", AgentType.TOOL, "type_discovery_error", {
      error: error.message,
      queryName: state.memory?.get("selectedQuery")?.name,
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
                error: `Type discovery failed: ${error.message}`,
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
              content: `Failed to analyze query types: ${error.message}`,
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
            content: `Type discovery failed: ${error.message}`,
          }),
        ],
        memory: state.memory,
      },
    });
  }
};
