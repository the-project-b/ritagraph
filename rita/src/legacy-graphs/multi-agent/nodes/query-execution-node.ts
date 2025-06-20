// Query Execution Node - Step 4: Execute Query
// Your prompt: "You are a GraphQL execution planner. You have: - The user's original request - The selected query and required parameters..."

import { Command } from "@langchain/langgraph";
import client from "../../../mcp/client.js";
import { ExtendedState } from "../../../states/states.js";
import { AgentType } from "../types/agents.js";
import { logEvent } from "../agents/supervisor-agent.js";
import { Task, TaskState } from "../types/index.js";
import { safeCreateMemoryMap } from "../utils/memory-helpers.js";

/**
 * Check for unresolved placeholders in the query
 */
function checkForUnresolvedPlaceholders(query: string): {
  hasUnresolved: boolean;
  placeholders: string[];
  suggestions: string[];
} {
  const placeholderMatches = query.match(/\{\{([^}]+)\}\}/g) || [];
  const placeholders = placeholderMatches.map((match) =>
    match.slice(2, -2).trim()
  );

  const suggestions = placeholders.map((placeholder) => {
    switch (placeholder.toLowerCase()) {
      case "contractids":
        return 'Specify contract IDs in your request, or use "all contracts" for all available contracts';
      case "companyid":
        return "Specify the company name or ID in your request";
      case "userid":
        return "Make sure user authentication is properly set up";
      case "status":
        return 'Specify the status filter (e.g., "active", "pending", "completed")';
      default:
        return `Provide the ${placeholder} parameter in your request`;
    }
  });

  return {
    hasUnresolved: placeholders.length > 0,
    placeholders,
    suggestions,
  };
}

/**
 * Query Execution Node - Generates and executes GraphQL queries
 */
export const queryExecutionNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent("info", AgentType.QUERY, "query_execution_start", { startTime });

  try {
    // Get data from previous nodes
    const taskState = state.memory?.get("taskState") as TaskState;
    if (!taskState) {
      throw new Error("No task state found");
    }

    const currentTaskIndex = taskState.tasks.findIndex(
      (task) => task.status === "in_progress"
    );
    const currentTask: Task = taskState.tasks[currentTaskIndex];
    const selectedQuery = currentTask.queryDetails;
    const userRequest = state.memory?.get("userRequest");

    if (!selectedQuery) {
      throw new Error(
        "No selected query found. Intent matching node should run first."
      );
    }

    if (!selectedQuery.generatedQuery) {
      throw new Error(
        "No generated query found. Query generation node should run first."
      );
    }

    // Check for unresolved placeholders
    const placeholderCheck = checkForUnresolvedPlaceholders(
      selectedQuery.generatedQuery
    );

    if (placeholderCheck.hasUnresolved) {
      logEvent("warn", AgentType.QUERY, "unresolved_placeholders_detected", {
        placeholders: placeholderCheck.placeholders,
        query: selectedQuery.generatedQuery,
      });

      // Create a user-friendly error message with suggestions
      const errorMessage =
        `I need more information to complete your request. The following parameters are missing:\n\n` +
        placeholderCheck.placeholders
          .map(
            (placeholder, index) =>
              `• ${placeholder}: ${placeholderCheck.suggestions[index]}`
          )
          .join("\n") +
        `\n\nPlease provide these details and try again.`;

      // Store the error result
      const updatedMemory = safeCreateMemoryMap(state.memory);
      selectedQuery.queryResult = {
        success: false,
        error: errorMessage,
        errorType: "MISSING_PARAMETERS",
        missingParameters: placeholderCheck.placeholders,
        suggestions: placeholderCheck.suggestions,
        executedAt: new Date().toISOString(),
      };

      // CRITICAL: Preserve userRequest in memory even for errors
      if (userRequest) {
        updatedMemory.set("userRequest", userRequest);
        console.log(
          "🔧 QUERY_EXECUTION (ERROR) - Preserved userRequest:",
          userRequest
        );
      }

      updatedMemory.set("taskState", taskState);

      logEvent("info", AgentType.QUERY, "query_execution_completed", {
        queryName: selectedQuery.selectedQueryName,
        duration: Date.now() - startTime,
        success: false,
        errorType: "MISSING_PARAMETERS",
      });

      // Continue to result formatting to provide user-friendly error
      return new Command({
        goto: "RESULT_FORMATTING",
        update: {
          messages: state.messages,
          memory: updatedMemory,
        },
      });
    }

    logEvent("info", AgentType.QUERY, "executing_query", {
      queryName: selectedQuery.selectedQueryName,
      userRequest: userRequest?.substring(0, 100),
      queryLength: selectedQuery.generatedQuery.length,
    });

    // Execute the query
    const result = await executeQuery(
      selectedQuery.generatedQuery,
      state,
      config
    );

    // Store the generated query
    const updatedMemory = safeCreateMemoryMap(state.memory);
    selectedQuery.queryResult = result;

    // CRITICAL: Preserve userRequest in memory throughout the flow
    if (userRequest) {
      updatedMemory.set("userRequest", userRequest);
      console.log("🔧 QUERY_EXECUTION - Preserved userRequest:", userRequest);
    }

    updatedMemory.set("taskState", taskState);

    logEvent("info", AgentType.QUERY, "query_execution_completed", {
      queryName: selectedQuery.selectedQueryName,
      duration: Date.now() - startTime,
      success: true,
    });

    // Continue to result formatting
    return new Command({
      goto: "RESULT_FORMATTING",
      update: {
        messages: state.messages,
        memory: updatedMemory,
      },
    });
  } catch (error) {
    logEvent("error", AgentType.QUERY, "query_execution_error", {
      error: error.message,
      stack: error.stack?.substring(0, 500),
    });

    // Get task state for error handling
    const taskState = state.memory?.get("taskState") as TaskState;
    const currentTaskIndex = taskState.tasks.findIndex(
      (task) => task.status === "in_progress"
    );
    const currentTask: Task = taskState.tasks[currentTaskIndex];
    const selectedQuery = currentTask.queryDetails;
    if (!selectedQuery) {
      throw new Error(
        "ERROR: Processing execution query error. No selected query found."
      );
    }

    // Create more user-friendly error messages
    let userFriendlyError = error.message;
    if (error.message.includes("execute-query tool not found")) {
      userFriendlyError =
        "The GraphQL execution service is currently unavailable. Please try again later.";
    } else if (
      error.message.includes("access") &&
      error.message.includes("token")
    ) {
      userFriendlyError =
        "Authentication error. Please make sure you are properly logged in.";
    } else if (error.message.includes("syntax")) {
      userFriendlyError =
        "There was an issue with the query structure. Please try rephrasing your request.";
    } else if (
      error.message.includes("network") ||
      error.message.includes("timeout")
    ) {
      userFriendlyError =
        "Network connection issue. Please check your connection and try again.";
    }

    const updatedMemory = safeCreateMemoryMap(state.memory);
    selectedQuery.queryResult = {
      success: false,
      error: userFriendlyError,
      originalError: error.message,
      errorType: "EXECUTION_ERROR",
      executedAt: new Date().toISOString(),
    };

    // CRITICAL: Preserve userRequest in memory even for execution errors
    const userRequest = state.memory?.get("userRequest");
    if (userRequest) {
      updatedMemory.set("userRequest", userRequest);
      console.log(
        "🔧 QUERY_EXECUTION (EXEC_ERROR) - Preserved userRequest:",
        userRequest
      );
    }

    updatedMemory.set("taskState", taskState);

    logEvent("info", AgentType.QUERY, "query_execution_completed", {
      queryName: selectedQuery.selectedQueryName,
      duration: Date.now() - startTime,
      success: false,
      errorType: "EXECUTION_ERROR",
    });

    // Continue to result formatting even with error
    return new Command({
      goto: "RESULT_FORMATTING",
      update: {
        messages: state.messages,
        memory: updatedMemory,
      },
    });
  }
};

/**
 * Execute the GraphQL query via MCP
 */
async function executeQuery(
  query: string,
  state: ExtendedState,
  config: any
): Promise<any> {
  const mcpTools = await client.getTools();
  const executeQueryTool = mcpTools.find((t) => t.name === "execute-query");

  if (!executeQueryTool) {
    throw new Error("execute-query tool not found");
  }

  // Extract access token from state or config
  const authUser =
    (config as any)?.user ||
    (config as any)?.langgraph_auth_user ||
    ((config as any)?.configurable &&
      (config as any).configurable.langgraph_auth_user);
  const authAccessToken = authUser?.token;
  const accessToken = state.accessToken || authAccessToken;

  const queryArgs = accessToken ? { query, accessToken } : { query };

  console.log("🔍 Executing query via MCP...");
  console.log(
    "🔍 Query:",
    query.substring(0, 200) + (query.length > 200 ? "..." : "")
  );

  const result = await executeQueryTool.invoke(queryArgs);

  return result;
}
