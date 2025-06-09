import { SystemMessage } from "@langchain/core/messages";
import { StructuredToolInterface, tool } from "@langchain/core/tools";
import { AnnotationRoot, BaseCheckpointSaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { MergedAnnotation } from "../states/states.js";
import { getCurrentTaskInput } from "@langchain/langgraph";

// Schema for GraphQL response output (actual data returned from database)
export const GraphQLResponseSchema = z.object({
    response: z.string().describe("The response data from the GraphQL query")
});

export type GraphQLResponseOutput = z.infer<typeof GraphQLResponseSchema>;

interface ReactAgentSettings {
    model: ChatOpenAI;
    tools: StructuredToolInterface[];
    prompt?: SystemMessage;
    name?: string;
    checkpointer?: BaseCheckpointSaver;
    stateSchema?: AnnotationRoot<any>;
    responseFormat?: z.ZodType<any>;
    additionalTools?: StructuredToolInterface[];
}

/**
 * Extract auth context from config (like toolNode.ts does)
 */
function extractAuthFromConfig(config: any) {
  const authUser =
    config?.user ||
    config?.langgraph_auth_user ||
    (config?.configurable && config.configurable.langgraph_auth_user);
  return authUser?.token;
}

/**
 * Wrap tools to automatically inject accessToken from state
 * This replicates the behavior of toolNode.ts for React agents
 */
function wrapToolsWithAuth(tools: StructuredToolInterface[]): StructuredToolInterface[] {
    return tools.map(originalTool => {
        const wrappedTool = tool(
            async (args: any, config?: any) => {
                // Get current state (like toolNode.ts does)
                const state = getCurrentTaskInput() as typeof MergedAnnotation.State;
                
                // Extract auth token from config if not in state (like toolNode.ts)
                const authTokenFromConfig = extractAuthFromConfig(config);
                const accessToken = state?.accessToken || authTokenFromConfig;
                
                // Inject accessToken into tool args (like toolNode.ts)
                const toolArgs = { ...args, accessToken };
                
                console.log(`🔧 TOOL WRAPPER: ${originalTool.name}`);
                console.log("- State accessToken:", state?.accessToken ? "PRESENT" : "MISSING");
                console.log("- Config auth token:", authTokenFromConfig ? "PRESENT" : "MISSING");
                console.log("- Final accessToken:", accessToken ? "PRESENT" : "MISSING");
                
                // Call the original tool with injected accessToken
                return await originalTool.invoke(toolArgs, config);
            },
            {
                name: originalTool.name,
                description: originalTool.description,
                schema: originalTool.schema,
            }
        );
        return wrappedTool;
    });
}

/**
 * Spawns a React Agent with the given settings and automatic auth injection
 * 
 * @param settings - The settings for the React Agent
 */
const spawnReactAgent = (settings: ReactAgentSettings) => {
    // Combine base tools with additional tools (like peer communication tools)
    const allTools = [
        ...settings.tools,
        ...(settings.additionalTools || [])
    ];

    // Wrap all tools with auth injection
    const wrappedTools = wrapToolsWithAuth(allTools);

    console.log("🔧 SPAWNING REACT AGENT:");
    console.log("- Agent name:", settings.name || "react_agent");
    console.log("- Original tools:", allTools.map(t => t.name));
    console.log("- Wrapped tools:", wrappedTools.map(t => t.name));

    return createReactAgent({
        llm: settings.model,
        tools: wrappedTools, // Use wrapped tools with auth injection
        name: settings.name || "react_agent",
        prompt: settings.prompt,
        checkpointer: settings.checkpointer,
        stateSchema: settings.stateSchema,
        responseFormat: settings.responseFormat,
    });
}

/**
 * Create an enhanced React Agent with peer communication tools
 */
const spawnReactAgentWithPeerTools = (
    baseSettings: ReactAgentSettings,
    peerTools: StructuredToolInterface[]
) => {
    return spawnReactAgent({
        ...baseSettings,
        additionalTools: peerTools,
    });
};

/**
 * Create a React Agent specifically configured for GraphQL queries
 */
const spawnGraphQLQueryAgent = (
    baseSettings: Omit<ReactAgentSettings, 'responseFormat'>
) => {
    return spawnReactAgent({
        ...baseSettings,
        responseFormat: GraphQLResponseSchema,
        name: baseSettings.name || "graphql_query_agent"
    });
};

export { 
    spawnReactAgent, 
    spawnReactAgentWithPeerTools, 
    spawnGraphQLQueryAgent,
    type ReactAgentSettings 
};