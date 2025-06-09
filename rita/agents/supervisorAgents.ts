import { MergedState, AgentConfig, PeerCommunicationConfig } from "../placeholders/types.js";
import { createCustomHandoffBackMessages } from "../tools/handoffTools.js";

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
 * Create an agent wrapper that properly handles state passing
 * This wrapper ensures that agents receive and return the full state properly
 */
export function createAgentWrapper(
  agent: any,
  agentConfig: AgentConfig,
  outputMode: 'full_history' | 'last_message',
  addHandoffBackMessages: boolean,
  supervisorName: string,
  allAgents: AgentConfig[],
  peerConfig?: PeerCommunicationConfig
) {
  return async (state: MergedState, config?: any): Promise<Partial<MergedState>> => {
    console.log(`---CALLING AGENT: ${agentConfig.name.toUpperCase()}---`);
    
    // Extract auth token from config if not in state (like toolNode.ts)
    const authTokenFromConfig = extractAuthFromConfig(config);
    const accessToken = state.accessToken || authTokenFromConfig;
    
    // Create enhanced state with auth context
    const enhancedState = {
      ...state,
      accessToken, // Ensure auth token is available
    };
    
    // Debug state before agent invocation
    console.log("🔧 AGENT WRAPPER DEBUG - BEFORE INVOCATION:");
    console.log("- Agent:", agentConfig.name);
    console.log("- State keys:", Object.keys(state));
    console.log("- State accessToken:", state.accessToken ? "PRESENT" : "MISSING");
    console.log("- Config auth token:", authTokenFromConfig ? "PRESENT" : "MISSING");
    console.log("- Final accessToken:", accessToken ? "PRESENT" : "MISSING");
    console.log("- Enhanced state keys:", Object.keys(enhancedState));
    console.log("- State messages count:", state.messages?.length || 0);
    
    // Log peer communication info if enabled
    if (peerConfig?.enabled && agentConfig.canTalkTo && agentConfig.canTalkTo.length > 0) {
      console.log(`---AGENT ${agentConfig.name.toUpperCase()} CAN COLLABORATE WITH: ${agentConfig.canTalkTo.join(', ')}---`);
    }
    
    // Agent receives the enhanced state with auth context
    console.log("🔧 INVOKING AGENT WITH ENHANCED STATE...");
    const output = await agent.invoke(enhancedState, config);
    
    // Debug output from agent
    console.log("🔧 AGENT WRAPPER DEBUG - AFTER INVOCATION:");
    console.log("- Agent output keys:", Object.keys(output));
    console.log("- Output messages count:", output.messages?.length || 0);
    console.log("- Output contains accessToken:", 'accessToken' in output);
    
    // Handle message filtering based on output mode
    let { messages, ...otherStateFromAgent } = output;
    if (outputMode === "last_message" && messages.length > 0) {
      messages = messages.slice(-1);
    }

    // Add handoff back messages if configured and we're returning to supervisor
    if (addHandoffBackMessages && (!peerConfig?.enabled || peerConfig?.alwaysReturnToSupervisor)) {
      const handoffMessages = createCustomHandoffBackMessages(agentConfig.name, supervisorName);
      messages = [...messages, ...handoffMessages];
    }

    // Return the updated state preserving all properties including auth
    const result = {
      ...enhancedState, // Preserve enhanced state (including auth)
      ...otherStateFromAgent, // Include any new state from agent
      messages, // Use processed messages
    };
    
    console.log("🔧 AGENT WRAPPER DEBUG - FINAL RESULT:");
    console.log("- Result keys:", Object.keys(result));
    console.log("- Result accessToken:", result.accessToken ? "PRESENT" : "MISSING");
    console.log("- Result accessToken value:", result.accessToken);
    console.log("- Result messages count:", result.messages?.length || 0);
    
    return result;
  };
}

/**
 * Legacy wrapper for backward compatibility
 */
export function createSimpleAgentWrapper(
  agent: any,
  agentName: string,
  outputMode: 'full_history' | 'last_message',
  addHandoffBackMessages: boolean,
  supervisorName: string
) {
  const agentConfig: AgentConfig = { name: agentName, agent };
  return createAgentWrapper(
    agent, 
    agentConfig, 
    outputMode, 
    addHandoffBackMessages, 
    supervisorName, 
    [agentConfig] // Single agent array
  );
} 