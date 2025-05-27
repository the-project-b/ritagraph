import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { MergedAnnotation } from "../states/states.js";

interface ToolNodeConfig {
  // Tool node doesn't need specific configurable fields currently
  // but we define the interface for consistency and future extensibility
}

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
      ((config as any)?.configurable && (config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;
    
    // Use state accessToken if available, otherwise fall back to auth token
    const accessToken = state.accessToken || authAccessToken;
    
    console.log("Tool Node - Using accessToken from:", state.accessToken ? "state" : "auth config");
    console.log("Tool Node - Access token:", accessToken);

    const lastMessage = state.messages[
      state.messages.length - 1
    ] as AIMessage;
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
        const toolArgs = { ...toolCall.args, accessToken: accessToken };
        try {
          const result = await tool.invoke(toolArgs);
          toolResult =
            typeof result === "string" ? result : JSON.stringify(result);
        } catch (e: any) {
          console.error(`Error invoking tool ${toolCall.name}:`, e);
          
          // Check if it's a GraphQL field validation error
          if (e.message && e.message.includes('Cannot query field')) {
            toolResult = `GraphQL Error: ${e.message}. Please use the 'graphql-introspect-queries' tool first to check available fields, then retry with the correct field names.`;
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
