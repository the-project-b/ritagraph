// Query Generation Node - Generates GraphQL queries based on type information
//
// ENHANCED PARAMETER RESOLUTION SYSTEM:
//
// This node now uses context gathered by the Context Gathering Node which handles:
//
// 1. STATIC PARAMETER EXTRACTION from user requests
// 2. DYNAMIC PARAMETER RESOLUTION from previous tasks
// 3. USER CONTEXT INTEGRATION from authentication
// 4. PLACEHOLDER SYSTEM for unresolved parameters
//
// USAGE EXAMPLES:
//
// User Request: "get payments for contracts id1, id2"
// Generated Query: payments(data: {companyId: "{{companyId}}", contractIds: ["id1", "id2"]})
//
// User Request: "show active payments"
// Generated Query: payments(data: {companyId: "{{companyId}}", contractIds: <contractIds>, status: ACTIVE})
//
// User Request: "get payments for company acme"
// Generated Query: payments(data: {companyId: "acme", contractIds: <contractIds>})
//
// PLACEHOLDER SYNTAX (GRAPHQL-SAFE):
// - {{variable}} - Mustache style (from LangSmith prompts and LLM generation)
// - <variable> - Angle bracket style (from context gathering fallbacks)
//
// CRITICAL: Single bracket {variable} syntax is AVOIDED to prevent conflicts
// with GraphQL object syntax like {field1, field2} and {variable: value}
//
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { placeholderManager } from "../../../placeholders/manager";
import { ExtendedState } from "../../../states/states";
import { logEvent } from "../agents/supervisor-agent";
import { loadTemplatePrompt } from "../prompts/configurable-prompt-resolver";
import { Task } from "../types";
import { AgentType } from "../types/agents";
import { ContextUtils, GatheredContext } from "./context-gathering-node";
import { safeCreateMemoryMap } from "../utils/memory-helpers";

/**
 * Generate parameter resolution strategies description for the LLM prompt
 */
function generateParameterStrategies(gatheredContext: GatheredContext): string {
  const strategies = [];

  if (Object.keys(gatheredContext.staticContext).length > 0) {
    strategies.push(
      `STATIC VALUES: ${JSON.stringify(gatheredContext.staticContext)}`
    );
  }

  if (Object.keys(gatheredContext.userContext).length > 0) {
    strategies.push(
      `USER CONTEXT: ${JSON.stringify(gatheredContext.userContext)}`
    );
  }

  if (Object.keys(gatheredContext.dynamicContext).length > 0) {
    strategies.push(
      `DYNAMIC DATA: Available from previous queries - ${Object.keys(
        gatheredContext.dynamicContext
      ).join(", ")}`
    );
  }

  // Add resolution strategies
  if (gatheredContext.resolutionStrategies.length > 0) {
    const strategiesDesc = gatheredContext.resolutionStrategies
      .map(
        (strategy) =>
          `${strategy.parameter}: confidence ${
            strategy.confidence
          } from [${strategy.sources.join(", ")}]${
            strategy.fallback ? ` fallback: ${strategy.fallback}` : ""
          }`
      )
      .join("\n");
    strategies.push(`RESOLUTION STRATEGIES:\n${strategiesDesc}`);
  }

  return strategies.length > 0
    ? strategies.join("\n\n")
    : "No context data available";
}

/**
 * Query Generation Node - Generates GraphQL queries based on type information
 */
export const queryGenerationNode = async (
  state: ExtendedState,
  config: any
) => {
  const startTime = Date.now();
  logEvent("info", AgentType.TOOL, "query_generation_start", { startTime });

  try {
    // Get data from previous nodes
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

    // Use improved context retrieval with fallback options
    let gatheredContext = ContextUtils.getMostRelevantContext(
      state,
      currentTask.id
    );

    if (!gatheredContext) {
      // Fallback: try to get from conversation memory (backward compatibility)
      gatheredContext = state.memory?.get("gatheredContext") as GatheredContext;
    }

    // Debug logging for context issues
    console.log("🔍 Query Generation - Context Debug:", {
      hasTaskContext: !!currentTask.context?.gatheredContext,
      hasConversationContext: !!state.memory?.get("gatheredContext"),
      taskId: currentTask.id,
      contextFromUtils: !!ContextUtils.getMostRelevantContext(
        state,
        currentTask.id
      ),
      memoryKeys: Array.from(state.memory?.keys() || []),
    });

    if (!gatheredContext) {
      throw new Error(
        "No gathered context found. Context gathering node should run first."
      );
    }

    const userRequest = state.memory?.get("userRequest");
    const selectedQuery = currentTask.queryDetails;

    if (!selectedQuery || !userRequest) {
      throw new Error(
        "No selected query found. Intent matching node should run first."
      );
    }

    // Generate parameter strategies description
    const parameterStrategies = generateParameterStrategies(gatheredContext);

    logEvent("info", AgentType.TOOL, "generating_query", {
      queryName: selectedQuery.selectedQueryName,
      userRequest: userRequest?.substring(0, 100),
      hasStaticContext: Object.keys(gatheredContext.staticContext).length > 0,
      hasUserContext: Object.keys(gatheredContext.userContext).length > 0,
      hasDynamicContext: Object.keys(gatheredContext.dynamicContext).length > 0,
      resolutionStrategies: gatheredContext.resolutionStrategies.length,
      contextSource: currentTask.context?.gatheredContext
        ? "task_specific"
        : "conversation_level",
    });

    // Use LLM to generate the query
    const model = new ChatOpenAI({ model: "gpt-4.1", temperature: 0 });
    // const model = new ChatAnthropic({ model: "claude-3-5-sonnet-20240620", temperature: 0 });

    // Load the query generation prompt using configurable template system
    let prompt = "";
    try {
      // Store query-specific data in state memory for template access
      state.memory?.set("selectedQueryName", selectedQuery.selectedQueryName);
      state.memory?.set("rawQueryDetails", selectedQuery.rawQueryDetails);
      state.memory?.set("rawTypeDetails", selectedQuery?.rawTypeDetails);
      state.memory?.set("originalInputType", selectedQuery.originalInputType);
      state.memory?.set(
        "signatureInputType",
        selectedQuery.signature?.input?.type
      );
      state.memory?.set("originalOutputType", selectedQuery.originalOutputType);
      state.memory?.set(
        "signatureOutputType",
        selectedQuery.signature?.output?.type
      );
      state.memory?.set("parameterStrategies", parameterStrategies);
      state.memory?.set("gatheredContext", gatheredContext);

      const promptResult = await loadTemplatePrompt(
        "template_query_generation",
        state,
        config,
        model,
        false
      );

      prompt = promptResult.populatedPrompt?.value || "";
      console.log(
        "🔧 QUERY GENERATION - Successfully loaded configurable template prompt"
      );
    } catch (error) {
      console.warn("Failed to load query generation template prompt:", error);
      // Fallback to default prompt
      prompt = `Generate a GraphQL query based on the following information:

USER REQUEST: ${userRequest}
SELECTED QUERY: ${selectedQuery.selectedQueryName}
QUERY DETAILS: ${selectedQuery.rawQueryDetails}
TYPE DETAILS: ${selectedQuery?.rawTypeDetails || "Not available"}

INPUT TYPE: ${selectedQuery.originalInputType}
OUTPUT TYPE: ${selectedQuery.originalOutputType}

PARAMETER STRATEGIES:
${parameterStrategies}

Generate a complete GraphQL query that:
1. Uses the correct query name and structure
2. Includes all required parameters
3. Uses mustache placeholders ({{variable}}) for dynamic values
4. Follows proper GraphQL syntax
5. Includes appropriate fields in the selection set

Return only the GraphQL query without any additional text or formatting.`;
    }

    const response = await model.invoke([new HumanMessage(prompt)]);
    let query =
      typeof response.content === "string" ? response.content.trim() : "";

    // Clean up the query
    query = query
      .replace(/```graphql\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Enhanced placeholder replacement with gathered context
    try {
      const invokeObject = await placeholderManager.buildInvokeObject(query, {
        state: state as any,
        config,
      });

      // Add gathered context to invoke object with explicit mapping
      Object.assign(
        invokeObject,
        gatheredContext.staticContext,
        gatheredContext.userContext
      );

      // CRITICAL FIX: Force resolution of auto_companyid even if not in query
      // The buildInvokeObject only resolves placeholders found in the query string,
      // but we need auto_companyid to be available for mapping to companyId
      if (!invokeObject.auto_companyid) {
        try {
          // Import the companyId resolver directly
          const { companyIdResolver } = await import(
            "../../../placeholders/companyId"
          );
          const autoCompanyId = await companyIdResolver.resolve({
            state: state as any,
            config,
          });
          if (autoCompanyId) {
            invokeObject.auto_companyid = autoCompanyId;
            console.log(
              "🔍 Query Generation: Force-resolved auto_companyid:",
              autoCompanyId
            );
          }
        } catch (error) {
          console.warn(
            "🔍 Query Generation: Failed to force-resolve auto_companyid:",
            error.message
          );
        }
      }

      // CRITICAL FIX: Force resolution of auto_contractIds even if not in query
      // The buildInvokeObject only resolves placeholders found in the query string,
      // but we need auto_contractIds to be available for mapping to contractIds
      if (!invokeObject.auto_contractIds) {
        try {
          // Import the contractIds resolver directly
          const { contractIdsResolver } = await import(
            "../../../placeholders/contractIds"
          );
          const autoContractIds = await contractIdsResolver.resolve({
            state: state as any,
            config,
          });
          if (autoContractIds && autoContractIds.trim()) {
            invokeObject.auto_contractIds = autoContractIds;
            console.log(
              "🔍 Query Generation: Force-resolved auto_contractIds:",
              autoContractIds
            );
          }
        } catch (error) {
          console.warn(
            "🔍 Query Generation: Failed to force-resolve auto_contractIds:",
            error.message
          );
        }
      }

      // Map placeholder resolver keys to expected placeholder names
      if (invokeObject.auto_companyid && !invokeObject.companyId) {
        invokeObject.companyId = invokeObject.auto_companyid;
        console.log(
          "🔍 Query Generation: Mapped auto_companyid to companyId:",
          invokeObject.companyId
        );
      }

      if (invokeObject.auto_contractIds && !invokeObject.contractIds) {
        // Convert comma-separated string to array if needed
        const contractIdsValue = invokeObject.auto_contractIds;
        if (
          typeof contractIdsValue === "string" &&
          contractIdsValue.includes(",")
        ) {
          invokeObject.contractIds = contractIdsValue
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id);
        } else {
          invokeObject.contractIds = contractIdsValue;
        }
        console.log(
          "🔍 Query Generation: Mapped auto_contractIds to contractIds:",
          invokeObject.contractIds
        );
      }

      // Explicitly ensure critical placeholders are mapped correctly from gathered context
      if (gatheredContext.userContext.companyId) {
        invokeObject.companyId = gatheredContext.userContext.companyId;
        console.log(
          "🔍 Query Generation: Using companyId from gathered context:",
          gatheredContext.userContext.companyId
        );
      }

      // Handle mustache placeholders ({{variable}}) and angle bracket placeholders (<variable>)
      const mustachePlaceholders = query.match(/\{\{([^}]+)\}\}/g) || [];
      const angleBracketPlaceholders = query.match(/\<([^>]+)\>/g) || [];
      const allPlaceholders = [
        ...mustachePlaceholders,
        ...angleBracketPlaceholders,
      ];

      for (const placeholder of allPlaceholders) {
        const isMustache = placeholder.startsWith("{{");
        const isAngleBracket = placeholder.startsWith("<");
        const placeholderName = isMustache
          ? placeholder.slice(2, -2).trim()
          : isAngleBracket
          ? placeholder.slice(1, -1).trim()
          : placeholder.slice(1, -1).trim();

        console.log(
          "🔍 Processing placeholder:",
          placeholderName,
          "Raw value:",
          invokeObject[placeholderName]
        );

        if (invokeObject[placeholderName]) {
          // Check if placeholder is already quoted in the query
          const quotedMustacheRegex = new RegExp(
            `"\\{\\{${placeholderName}\\}\\}"`,
            "g"
          );
          const quotedAngleBracketRegex = new RegExp(
            `"\\<${placeholderName}\\>"`,
            "g"
          );
          const isAlreadyQuoted =
            quotedMustacheRegex.test(query) ||
            quotedAngleBracketRegex.test(query);

          // Format the value properly for GraphQL
          let value = invokeObject[placeholderName];

          if (Array.isArray(value)) {
            // Format array values
            const formattedArray = value
              .map((v) => (typeof v === "string" ? `"${v}"` : v))
              .join(", ");
            value = `[${formattedArray}]`;
          } else if (typeof value === "string") {
            if (isAlreadyQuoted) {
              // Placeholder is already quoted in query, use raw value
              value = value;
            } else {
              // Placeholder is not quoted, add quotes for GraphQL
              value = `"${value}"`;
            }
          }

          console.log(
            "🔍 Formatted value for",
            placeholderName,
            ":",
            value,
            "isAlreadyQuoted:",
            isAlreadyQuoted,
            "isMustache:",
            isMustache,
            "isAngleBracket:",
            isAngleBracket
          );

          // Replace placeholder with formatted value
          if (isAlreadyQuoted) {
            // Replace quoted placeholders with quoted value
            if (isMustache) {
              query = query.replace(quotedMustacheRegex, `"${value}"`);
            } else if (isAngleBracket) {
              query = query.replace(quotedAngleBracketRegex, `"${value}"`);
            }
          } else {
            // Replace unquoted placeholders with formatted value
            if (isMustache) {
              query = query.replace(
                new RegExp(`\\{\\{${placeholderName}\\}\\}`, "g"),
                value
              );
            } else if (isAngleBracket) {
              query = query.replace(
                new RegExp(`\\<${placeholderName}\\>`, "g"),
                value
              );
            }
          }
        } else {
          logEvent("info", AgentType.TOOL, "unresolved_placeholder", {
            placeholder: placeholderName,
            availableParams: Object.keys(invokeObject),
            resolutionStrategies: gatheredContext.resolutionStrategies.filter(
              (s) => s.parameter === placeholderName
            ),
          });
        }
      }
    } catch (error) {
      console.warn(
        "🔍 Query Generation: Placeholder replacement failed:",
        error.message
      );
    }

    console.log("🔍 Query Generation: Generated query:", query);

    // Store the generated query
    const updatedMemory = safeCreateMemoryMap(state.memory);
    selectedQuery.generatedQuery = query;

    // CRITICAL: Preserve userRequest in memory throughout the flow
    if (userRequest) {
      updatedMemory.set("userRequest", userRequest);
      console.log("🔧 QUERY_GENERATION - Preserved userRequest:", userRequest);
    }

    updatedMemory.set("taskState", taskState);

    logEvent("info", AgentType.TOOL, "query_generation_completed", {
      queryName: selectedQuery.selectedQueryName,
      duration: Date.now() - startTime,
      hasUnresolvedPlaceholders: query.includes("{{") || query.includes("<"),
      contextUsed: {
        static: Object.keys(gatheredContext.staticContext).length,
        dynamic: Object.keys(gatheredContext.dynamicContext).length,
        user: Object.keys(gatheredContext.userContext).length,
      },
      contextTimestamp: gatheredContext.timestamp,
    });

    // Continue to query execution
    return new Command({
      goto: "QUERY_EXECUTION",
      update: {
        messages: state.messages,
        memory: updatedMemory,
      },
    });
  } catch (error) {
    logEvent("error", AgentType.TOOL, "query_generation_error", {
      error: error.message,
    });

    // CRITICAL FIX: Don't throw errors that cause infinite loops
    // Instead, mark the task as failed and return to supervisor
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
                error: `Query generation failed: ${error.message}`,
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
              content: `Failed to generate query: ${error.message}`,
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
            content: `Query generation failed: ${error.message}`,
          }),
        ],
        memory: state.memory,
      },
    });
  }
};
