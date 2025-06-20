import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { MergedAnnotation } from "../states/states.js";
import { parse } from "graphql/language";

interface ToolNodeConfig {
  // Tool node doesn't need specific configurable fields currently
  // but we define the interface for consistency and future extensibility
}

interface GraphQLToolArgs {
  query: string;
  variables?: string;
  accessToken?: string;
  [key: string]: any; // Allow for additional properties from toolCall.args
}

// Helper function to validate GraphQL query and variables
const validateGraphQLOperation = (
  query: string | undefined,
  variables?: string
) => {
  if (!query) {
    return {
      isValid: false,
      error: "Query is required for GraphQL operations",
    };
  }

  try {
    const parsedQuery = parse(query);
    const parsedVariables = variables ? JSON.parse(variables) : {};

    // Extract variable definitions from query
    const queryVars = parsedQuery.definitions
      .filter((def) => def.kind === "OperationDefinition")
      .flatMap((def) => def.variableDefinitions || []);

    // Validate each variable has a matching value
    const missingVars: string[] = [];
    for (const varDef of queryVars) {
      const varName = varDef.variable.name.value;
      if (!(varName in parsedVariables)) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      return {
        isValid: false,
        error: `Missing variable values for: ${missingVars.join(
          ", "
        )}. Please provide matching variables.`,
      };
    }

    return { isValid: true };
  } catch (error: any) {
    return {
      isValid: false,
      error: `Invalid GraphQL operation: ${error.message}`,
    };
  }
};

// Tool node implementation
const createToolNode = (mcpTools: any[]) => {
  return async (
    state: typeof MergedAnnotation.State,
    config: LangGraphRunnableConfig<ToolNodeConfig>
  ) => {
    // Priority: 1. State accessToken, 2. Auth token from config
    const authUser =
      (config as any)?.user ||
      (config as any)?.langgraph_auth_user ||
      ((config as any)?.configurable &&
        (config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;

    // Use state accessToken if available, otherwise fall back to auth token
    const accessToken = state.accessToken || authAccessToken;

    console.log(
      "Tool Node - Using accessToken from:",
      state.accessToken ? "state" : "auth config"
    );
    console.log("Tool Node - Access token:", accessToken);

    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (
      !lastMessage ||
      !lastMessage.tool_calls ||
      lastMessage.tool_calls.length === 0
    ) {
      return { messages: [] };
    }

    const toolMessages: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
      const tool = mcpTools.find((t) => t.name === toolCall.name);
      let toolResult = "";
      if (tool) {
        const toolArgs = {
          ...toolCall.args,
          accessToken: accessToken,
        } as GraphQLToolArgs;
        try {
          // Validate GraphQL operations before execution
          if (
            toolCall.name === "execute-query" ||
            toolCall.name === "execute-mutation"
          ) {
            if (!toolArgs.query) {
              toolResult = "Error: Query is required for GraphQL operations";
              if (toolCall.id) {
                toolMessages.push(
                  new ToolMessage({
                    content: toolResult,
                    name: toolCall.name,
                    tool_call_id: toolCall.id,
                  })
                );
              }
              continue;
            }
            const validation = validateGraphQLOperation(
              toolArgs.query,
              toolArgs.variables
            );
            if (!validation.isValid) {
              toolResult = validation.error || "Unknown validation error";
              if (toolCall.id) {
                toolMessages.push(
                  new ToolMessage({
                    content: toolResult,
                    name: toolCall.name,
                    tool_call_id: toolCall.id,
                  })
                );
              }
              continue;
            }
          }

          const result = await tool.invoke(toolArgs);
          toolResult =
            typeof result === "string" ? result : JSON.stringify(result);
        } catch (e: any) {
          console.error(`Error invoking tool ${toolCall.name}:`, e);

          // Enhanced error handling for GraphQL operations
          if (
            toolCall.name === "execute-query" ||
            toolCall.name === "execute-mutation"
          ) {
            if (
              e.message &&
              (e.message.includes("Cannot query field") ||
                e.message.includes("Variable") ||
                e.message.includes("Expected type"))
            ) {
              toolResult =
                `GraphQL Error: ${e.message}\n\n` +
                `Please ensure:\n` +
                `1. Query variables match the expected types\n` +
                `2. All required fields are included\n` +
                `3. The structure of variables matches the query parameters\n` +
                `4. Use the introspection tools first to verify field names and types`;
            } else {
              toolResult = `Error: ${e.message || JSON.stringify(e)}`;
            }
          } else {
            toolResult = `Error: ${e.message || JSON.stringify(e)}`;
          }
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
      } else {
        console.warn(
          `Tool call for ${toolCall.name} is missing an ID. Skipping.`
        );
      }
    }
    return { messages: toolMessages };
  };
};

export { createToolNode, type ToolNodeConfig };
