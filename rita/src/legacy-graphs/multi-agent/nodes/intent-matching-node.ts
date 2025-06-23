// Intent Matching Node - Step 2: Match Query to Intent
// Your prompt: "Given the user's request... Choose the most appropriate query from the list that matches what the user wants to achieve."

import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import client from "../../../mcp/client.js";
import { ExtendedState } from "../../../states/states.js";
import { logEvent } from "../agents/supervisor-agent.js";
import { loadTemplatePrompt } from "../prompts/configurable-prompt-resolver.js";
import { TaskState } from "../types/index.js";
import { AgentType } from "../types/agents.js";
import { builtInQueryManager } from "./built-in-queries.tool.js";
import { safeCreateMemoryMap } from "../utils/memory-helpers.js";

interface SkipSettings {
  skipDiscovery?: boolean;
  skipIntentMatching?: boolean;
  skipTypeDiscovery?: boolean;
  skipTypeProcessing?: boolean;
}

interface IntentMatch {
  name: string;
  arguments: any;
  reason: string;
  skipSettings?: SkipSettings;
}

/**
 * Intent Matching Node - Matches user intent to best available query
 */
export const intentMatchingNode = async (state: ExtendedState, config: any) => {
  // Extract access token from state or config
  const authUser =
    (config as any)?.user ||
    (config as any)?.langgraph_auth_user ||
    ((config as any)?.configurable &&
      (config as any).configurable.langgraph_auth_user);
  const authAccessToken = authUser?.token;
  const accessToken = state.accessToken || authAccessToken;

  const startTime = Date.now();
  logEvent("info", AgentType.TOOL, "intent_matching_start", { startTime });

  try {
    // Get discovered queries from previous node
    const queries = state.memory?.get("discoveredQueries");
    if (!queries || typeof queries !== "string") {
      throw new Error(
        "No discovered queries found. Query discovery node should run first."
      );
    }

    // Get current task from state
    const taskState = state.memory?.get("taskState") as TaskState;
    if (!taskState) {
      throw new Error("No task state found");
    }

    const currentTaskIndex = taskState.tasks.findIndex(
      (task) => task.status === "in_progress"
    );
    const currentTask = taskState.tasks[currentTaskIndex];
    if (!currentTask) {
      throw new Error("No current task found");
    }

    // CRITICAL: Use original user request from memory, not task description
    // Task description may be translated/interpreted, but we want original user language
    const originalUserRequest = state.memory?.get("userRequest") as string;
    const userRequest = originalUserRequest || currentTask.description;
    if (!userRequest) {
      throw new Error("No user request found");
    }

    logEvent("info", AgentType.TOOL, "matching_intent", {
      userRequest: userRequest.substring(0, 100),
    });

    // Match intent using LLM
    let selectedQuery: IntentMatch | null = null;
    let selectedMutation: IntentMatch | null = null;
    if (currentTask.type === "query") {
      selectedQuery = await matchQueryToIntent(
        userRequest,
        queries,
        state,
        config
      );

      // Check for built-in query handlers that bypass the normal pipeline
      const builtInResult = await builtInQueryManager.handleBuiltInQuery(
        state,
        config,
        userRequest,
        selectedQuery
      );
      if (builtInResult) {
        return builtInResult;
      }

      logEvent("info", AgentType.TOOL, "intent_matched", {
        selectedQueryName: selectedQuery?.name,
        selectionReason: selectedQuery?.reason,
        skipSettings: selectedQuery?.skipSettings,
      });

      // Get query details from MCP
      const mcpTools = await client.getTools();
      const getQueryDetailsTool = mcpTools.find((tool) =>
        tool.name.includes("graphql-get-query-details")
      );

      if (!getQueryDetailsTool) {
        throw new Error("graphql-get-query-details tool not found");
      }

      try {
        // Execute query task
        const queryDetails = await getQueryDetailsTool.invoke({
          queryNames: selectedQuery?.name,
          accessToken,
        });

        // Parse query details to extract types
        const detailsText =
          typeof queryDetails === "string"
            ? queryDetails
            : JSON.stringify(queryDetails);
        console.log("🔍 INTENT MATCHING: Raw query details:", detailsText);

        // 1. queryName: returnType! (simple format)
        // 2. queryName(args): returnType! (with arguments)
        const simpleFormatMatch = detailsText.match(
          new RegExp(`${selectedQuery?.name}\\s*:\\s*([^!\\n]+)!?`)
        );
        const argsFormatMatch = detailsText.match(
          new RegExp(
            `${selectedQuery?.name}\\s*\\(([^)]*)\\)\\s*:\\s*([^!\\n]+)!?`
          )
        );

        let inputType = "Unknown";
        let outputType = "Unknown";

        if (argsFormatMatch) {
          // Format with arguments: queryName(args): returnType
          outputType = argsFormatMatch[2].trim();

          // Extract input type from args
          const argsText = argsFormatMatch[1];
          const inputTypeMatch = argsText.match(/([^:]+):\s*([^!]+)!?/);
          if (inputTypeMatch) {
            inputType = inputTypeMatch[2].trim();
          }
        } else if (simpleFormatMatch) {
          // Simple format: queryName: returnType
          outputType = simpleFormatMatch[1].trim();
        }

        console.log("🔍 INTENT MATCHING: Query details parsed:");
        console.log("  - Query Name:", selectedQuery.name);
        console.log("  - Input Type:", inputType);
        console.log("  - Output Type:", outputType);
        console.log("  - Raw Details:", detailsText);

        // Store result for next node with parsed types and skip settings
        const updatedMemory = safeCreateMemoryMap(state.memory);

        // Preserve userRequest (already using original from memory)
        updatedMemory.set("userRequest", userRequest);
        console.log("🔧 INTENT_MATCHING - Preserved userRequest:", userRequest);

        // Update current task with selected query data
        const updatedTaskState = { ...taskState };
        updatedTaskState.tasks[currentTaskIndex] = {
          ...currentTask,
          queryDetails: {
            selectedQueryName: selectedQuery?.name,
            selectionReason: selectedQuery?.reason,
            skipSettings: selectedQuery?.skipSettings,
            originalInputType: inputType,
            originalOutputType: outputType,
            rawQueryDetails: detailsText,
          },
        };
        updatedMemory.set("taskState", updatedTaskState);

        return new Command({
          goto: "TYPE_DISCOVERY", // Continue to type discovery
          update: {
            messages: state.messages,
            memory: updatedMemory,
          },
        });
      } catch (error) {
        console.error(
          "🔍 INTENT MATCHING: Failed to parse query details:",
          error
        );

        // CRITICAL FIX: Don't throw errors, mark task as failed and continue
        const updatedTaskState = {
          ...taskState,
          tasks: taskState.tasks.map((task) =>
            task.id === currentTask.id
              ? {
                  ...task,
                  status: "failed" as const,
                  error: `Failed to parse query details: ${error.message}`,
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
                content: `Failed to match intent: ${error.message}`,
              }),
            ],
            memory: updatedMemory,
          },
        });
      }
    } else if (currentTask.type === "mutation") {
      // selectedMutation = await matchMutationToIntent(userRequest, queries);
      // TODO: Handle mutation intent matching
      const updatedTaskState = {
        ...taskState,
        tasks: taskState.tasks.map((task) =>
          task.id === currentTask.id
            ? {
                ...task,
                status: "failed" as const,
                error: "Mutation intent matching not yet implemented",
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
              content: "Mutation operations are not yet supported",
            }),
          ],
          memory: updatedMemory,
        },
      });
    } else {
      // Invalid task type - mark as failed
      const updatedTaskState = {
        ...taskState,
        tasks: taskState.tasks.map((task) =>
          task.id === currentTask.id
            ? {
                ...task,
                status: "failed" as const,
                error: `Invalid task type: ${currentTask.type}`,
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
              content: `Invalid task type: ${currentTask.type}`,
            }),
          ],
          memory: updatedMemory,
        },
      });
    }
  } catch (error) {
    logEvent("error", AgentType.TOOL, "intent_matching_error", {
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
                error: `Intent matching failed: ${error.message}`,
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
              content: `Intent matching failed: ${error.message}`,
            }),
          ],
          memory: updatedMemory,
        },
      });
    }

    // Fallback if no task state
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: `Intent matching failed: ${error.message}`,
          }),
        ],
        memory: state.memory,
      },
    });
  }
};

/**
 * Match user intent to best query using LLM
 */
async function matchQueryToIntent(
  userRequest: string,
  queries: string,
  state: ExtendedState,
  config: any
): Promise<IntentMatch> {
  const model = new ChatOpenAI({ model: "gpt-4.1-mini", temperature: 0 });

  // Load the intent matching prompt using configurable template system
  let prompt = "";
  try {
    // Store data in state memory for template access
    state.memory?.set("queries", queries);
    state.memory?.set("discoveredQueries", queries);

    const promptResult = await loadTemplatePrompt(
      "template_intent_matching",
      state,
      config,
      model,
      false
    );

    prompt = promptResult.populatedPrompt?.value || "";
    console.log(
      "🔧 INTENT MATCHING - Successfully loaded configurable template prompt"
    );
  } catch (error) {
    console.warn("Failed to load intent matching template prompt:", error);
    // Fallback to default prompt
    prompt = `Given the user's request: "${userRequest}"
And the following available GraphQL queries:

${queries}

Your task is to select ONE most appropriate query that matches the user's intent. The queries are provided in GraphQL schema format.

Respond with a JSON object containing:
{
  "name": "selected_query_name",
  "arguments": {},
  "reason": "explanation for why this query was selected"
}

Select the query that best matches the user's intent.`;
  }

  const response = await model.invoke([new HumanMessage(prompt)]);

  try {
    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Try to extract a single valid JSON object from the response
    let match;
    try {
      // First try parsing the entire content
      match = JSON.parse(content);
    } catch (e) {
      // If that fails, try to extract a single JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        match = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No valid JSON object found in response");
      }
    }

    // Validate the selected query exists in the string
    const queryExists = queries.includes(match.name);
    if (!queryExists) {
      console.warn(`Selected query "${match.name}" not found, using fallback`);
      return getFallbackQuery(userRequest, queries);
    }

    return match;
  } catch (error) {
    console.warn("Intent matching failed, using fallback:", error.message);
    return getFallbackQuery(userRequest, queries);
  }
}

/**
 * Fallback logic for when LLM intent matching fails
 */
export function getFallbackQuery(
  userRequest: string,
  queries: string
): IntentMatch {
  const lowerRequest = userRequest.toLowerCase();

  // Simple keyword matching as fallback
  if (
    lowerRequest.includes("me") ||
    lowerRequest.includes("my") ||
    lowerRequest.includes("who am i")
  ) {
    if (queries.includes("me")) {
      return {
        name: "me",
        arguments: {},
        reason: "Fallback: detected user identity request",
      };
    }
  }

  if (
    lowerRequest.includes("employee") ||
    lowerRequest.includes("staff") ||
    lowerRequest.includes("people")
  ) {
    // IMPORTANT: Always prefer employeesByCompany over employees for better data
    if (queries.includes("employeesByCompany")) {
      return {
        name: "employeesByCompany",
        arguments: {},
        reason:
          "Fallback: detected employee request - using employeesByCompany for richer data with contracts",
      };
    }

    // Only fall back to employees if employeesByCompany is not available
    if (queries.includes("employees")) {
      return {
        name: "employees",
        arguments: {},
        reason:
          "Fallback: detected employee request - using employees as employeesByCompany not available",
      };
    }
  }

  if (
    lowerRequest.includes("company") ||
    lowerRequest.includes("organization")
  ) {
    if (queries.includes("company")) {
      return {
        name: "company",
        arguments: {},
        reason: "Fallback: detected company request",
      };
    }
  }

  // Default to me query for identity-related requests
  if (queries.includes("me")) {
    return {
      name: "me",
      arguments: {},
      reason: "Fallback: defaulting to user identity query",
    };
  }

  // Default to first available query
  const firstQuery = queries
    .split("\n")
    .find(
      (line) => line.trim() && !line.startsWith("#") && !line.startsWith("//")
    );
  return {
    name: firstQuery || "me",
    arguments: {},
    reason: "Fallback: using first available query",
  };
}
