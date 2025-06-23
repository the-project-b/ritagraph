import { AIMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import client from "../../../mcp/client.js";
import { ExtendedState } from "../../../states/states.js";
import { AgentType } from "../types/agents.js";
import { logEvent } from "../agents/supervisor-agent.js";
import { MutationExecutionResult } from "./index";
import { safeCreateMemoryMap } from "../utils/memory-helpers.js";

/**
 * Executes a GraphQL mutation using the MCP client
 */
export const mutationExecutionNode = async (
  state: ExtendedState,
  config: any
) => {
  logEvent("info", AgentType.TOOL, "mutation_execution_start");

  try {
    // Get mutation context from state
    const mutationContext = state.memory?.get("mutationContext");
    if (!mutationContext) {
      throw new Error("No mutation context found in state");
    }

    // Get current task
    const taskState = state.memory?.get("taskState");
    const currentTask = taskState?.tasks?.find(
      (task: any) => task.status === "in_progress"
    );
    if (!currentTask) {
      throw new Error("No current task found");
    }

    // Get mutation details
    const { mutation, variables } = mutationContext;
    if (!mutation) {
      throw new Error("No mutation found in context");
    }

    // Get access token
    const accessToken = state.memory?.get("accessToken") || config?.accessToken;
    if (!accessToken) {
      throw new Error("No access token found");
    }

    // Execute mutation
    logEvent("info", AgentType.TOOL, "executing_mutation", {
      mutationName: mutation.name,
      variables: variables,
    });

    const mcpTools = await client.getTools();
    const executeMutationTool = mcpTools.find(
      (t) => t.name === "execute-mutation"
    );

    if (!executeMutationTool) {
      throw new Error("execute-mutation tool not found");
    }

    const mutationArgs = {
      mutation: mutation.document,
      variables,
      accessToken,
    };

    console.log("⚡ Executing mutation via MCP...");
    const result = await executeMutationTool.invoke(mutationArgs);

    // Format execution result
    const executionResult: MutationExecutionResult = {
      success: true,
      data: result.data,
      errors: result.errors,
      metadata: {
        mutationName: mutation.name,
        executionTime: new Date().toISOString(),
        variables: variables,
      },
    };

    // Update task result
    const updatedState = {
      ...state,
      memory: safeCreateMemoryMap(state.memory).set(
        "mutationExecutionResult",
        executionResult
      ),
    };

    // Log success
    logEvent("info", AgentType.TOOL, "mutation_execution_success", {
      mutationName: mutation.name,
      hasErrors: !!result.errors,
    });

    // Return command to continue to result formatting
    return new Command({
      goto: "RESULT_FORMATTING",
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: `Successfully executed mutation: ${mutation.name}`,
          }),
        ],
        memory: updatedState.memory,
      },
    });
  } catch (error) {
    // Log error
    logEvent("error", AgentType.TOOL, "mutation_execution_error", {
      error: error.message,
    });

    // Update task with error
    const taskState = state.memory?.get("taskState");
    const currentTask = taskState?.tasks?.find(
      (task: any) => task.status === "in_progress"
    );
    if (currentTask) {
      const updatedTaskState = {
        ...taskState,
        tasks: taskState.tasks.map((task: any) =>
          task.id === currentTask.id
            ? { ...task, status: "failed", error: error.message }
            : task
        ),
      };

      return new Command({
        goto: AgentType.SUPERVISOR,
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: `Failed to execute mutation: ${error.message}`,
            }),
          ],
          memory: safeCreateMemoryMap(state.memory).set(
            "taskState",
            updatedTaskState
          ),
        },
      });
    }

    // If no current task, just return error
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: `Failed to execute mutation: ${error.message}`,
          }),
        ],
      },
    });
  }
};
