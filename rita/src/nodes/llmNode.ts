import { ChatOpenAI } from "@langchain/openai";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { MergedAnnotation } from "../states/states";

interface LlmNodeConfig {
  systemPrompt?: string;
  useExpensiveModel?: boolean;
  temperature?: number;
  modelOverride?: {
    cheap?: string;
    expensive?: string;
  };
}

// Define the function that calls the model
const createLlmNode = (mcpTools: any[]) => {
  return async (
    state: typeof MergedAnnotation.State,
    config: LangGraphRunnableConfig<LlmNodeConfig>
  ) => {
    // console.log("LLM Node - State:", state);
    // console.log("LLM Node - Config:", config);

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
      "LLM Node - Using accessToken from:",
      state.accessToken ? "state" : "auth config"
    );
    console.log("LLM Node - Access token:", accessToken);

    const lastMsg = state.messages[state.messages.length - 1];
    const userMessage =
      typeof lastMsg?.content === "string" ? lastMsg.content : "";

    // Check config for model preference, fallback to heuristic
    const useExpensive =
      config.configurable?.useExpensiveModel ??
      (userMessage.length > 200 || userMessage.includes("complex"));

    const temperature = config.configurable?.temperature ?? 0;
    const cheapModelName =
      config.configurable?.modelOverride?.cheap ?? "gpt-3.5-turbo";
    const expensiveModelName =
      config.configurable?.modelOverride?.expensive ?? "gpt-4o";

    // Create models with MCP tools bound
    const cheapModel = new ChatOpenAI({
      model: cheapModelName,
      temperature,
    }).bindTools(mcpTools);

    const expensiveModel = new ChatOpenAI({
      model: expensiveModelName,
      temperature,
    }).bindTools(mcpTools);

    // Use system prompt from state (set by dynamic prompt entry), config, or default GraphQL rules
    const stateSystemMessages = state.systemMessages || [];

    // Include all system messages
    const messages = [
      ...stateSystemMessages.map((msg) => ({
        role: "system",
        content: msg.content,
      })),
      ...state.messages,
    ];

    let response = await (useExpensive ? expensiveModel : cheapModel).invoke(
      messages
    );

    // Fallback: if no tool call, try expensive model
    if (!response.tool_calls || response.tool_calls.length === 0) {
      response = await expensiveModel.invoke(messages);
    }
    return { messages: [response] };
  };
};

export { createLlmNode, type LlmNodeConfig };
