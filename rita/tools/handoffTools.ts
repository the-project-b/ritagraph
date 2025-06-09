import { Command, getCurrentTaskInput } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { MergedState, PeerCommunicationConfig } from "../placeholders/types.js";

/**
 * Normalize agent name for tool naming
 */
export function normalizeAgentName(agentName: string): string {
  return agentName.trim().replace(/\s+/g, "_").toLowerCase();
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
 * Create a handoff tool that properly preserves ALL state using Command pattern
 * This is the key fix - using Command like the original langgraph-supervisor
 */
export function createCustomHandoffTool(agentName: string, agentDescription?: string) {
  const toolName = `transfer_to_${normalizeAgentName(agentName)}`;
  
  return tool(
    async (_, config) => {
      // Debug the config structure to understand why toolCall.id might be undefined
      console.log("🔧 SUPERVISOR HANDOFF TOOL CONFIG DEBUG:");
      console.log("- Config keys:", Object.keys(config || {}));
      console.log("- Config.toolCall:", config?.toolCall);
      console.log("- Config.configurable:", config?.configurable);
      
      const toolCallId = config?.toolCall?.id;
      if (!toolCallId) {
        console.error("❌ ERROR: toolCall.id is undefined in supervisor handoff tool", toolName);
        console.error("- Full config:", JSON.stringify(config, null, 2));
        throw new Error(`Tool call ID is missing for ${toolName}`);
      }

      const toolMessage = new ToolMessage({
        content: `Successfully transferred to ${agentName}`,
        name: toolName,
        tool_call_id: toolCallId,
      });

      // Get the FULL current state using getCurrentTaskInput (like original)
      const state = getCurrentTaskInput() as MergedState;
      
      // Extract auth token from config if not in state (like toolNode.ts)
      const authTokenFromConfig = extractAuthFromConfig(config);
      const accessToken = state.accessToken || authTokenFromConfig;
      
      console.log("🔧 SUPERVISOR HANDOFF TOOL DEBUG:");
      console.log("- Tool name:", toolName);
      console.log("- Target agent:", agentName);
      console.log("- Tool call ID:", toolCallId);
      console.log("- State keys:", Object.keys(state));
      console.log("- State accessToken:", state.accessToken ? "PRESENT" : "MISSING");
      console.log("- Config auth token:", authTokenFromConfig ? "PRESENT" : "MISSING");
      console.log("- Final accessToken:", accessToken ? "PRESENT" : "MISSING");
      console.log("- State messages count:", state.messages?.length || 0);
      
      // Return Command to transfer control (like original)
      // BUT preserve ALL state properties, not just messages
      const updatedState = {
        ...state, // Preserve ALL existing state
        accessToken, // Include auth token from config if needed
        messages: state.messages.concat(toolMessage), // Add the handoff message
        // Reset peer hop count when going through supervisor
        peerHopCount: 0,
      };
      
      console.log("🔧 UPDATED STATE FOR SUPERVISOR HANDOFF:");
      console.log("- Updated state keys:", Object.keys(updatedState));
      console.log("- Updated accessToken:", updatedState.accessToken ? "PRESENT" : "MISSING");
      console.log("- Updated messages count:", updatedState.messages?.length || 0);
      
      return new Command({
        goto: agentName,
        graph: Command.PARENT,
        update: updatedState,
      });
    },
    {
      name: toolName,
      schema: z.object({}), // Keep empty schema for supervisor tools (follows official pattern)
      description: agentDescription || `Transfer control to ${agentName} agent for specialized assistance.`,
    }
  );
}

/**
 * Create a peer-to-peer handoff tool for direct agent communication
 */
export function createPeerHandoffTool(
  targetAgentName: string, 
  supervisorName: string,
  peerConfig: PeerCommunicationConfig,
  agentDescription?: string
) {
  const toolName = `peer_transfer_to_${normalizeAgentName(targetAgentName)}`;
  
  return tool(
    async (input, config) => {
      const toolCallId = config?.toolCall?.id;
      if (!toolCallId) {
        console.error("❌ ERROR: toolCall.id is undefined in peer handoff tool", toolName);
        throw new Error(`Tool call ID is missing for ${toolName}`);
      }

      // Include the task/context in the tool message
      const taskDescription = input.task || "No specific task provided";
      const userInfo = input.userInfo;
      const additionalInput = input.input;
      
      let transferMessage = `Peer transfer to ${targetAgentName}: ${taskDescription}`;
      if (userInfo) {
        transferMessage += `\nUser: ${userInfo.fullName} (${userInfo.email}), Company: ${userInfo.companyId}`;
      }
      if (additionalInput) {
        transferMessage += `\nAdditional input: ${JSON.stringify(additionalInput)}`;
      }
      
      const toolMessage = new ToolMessage({
        content: transferMessage,
        name: toolName,
        tool_call_id: toolCallId,
      });

      // Get the FULL current state
      const state = getCurrentTaskInput() as MergedState;
      const currentHops = (state as any).peerHopCount || 0;
      const newHopCount = currentHops + 1;

      // Extract auth token from config if not in state
      const authTokenFromConfig = extractAuthFromConfig(config);
      const accessToken = state.accessToken || authTokenFromConfig;

      console.log("🔧 PEER HANDOFF TOOL DEBUG:");
      console.log("- Tool name:", toolName);
      console.log("- Target agent:", targetAgentName);
      console.log("- Task:", taskDescription);
      console.log("- User info:", userInfo ? `${userInfo.fullName} (${userInfo.email})` : "Not provided");
      console.log("- Additional input:", additionalInput ? Object.keys(additionalInput) : "Not provided");
      console.log("- Current hops:", currentHops);
      console.log("- New hop count:", newHopCount);
      console.log("- State accessToken:", state.accessToken ? "PRESENT" : "MISSING");
      console.log("- Config auth token:", authTokenFromConfig ? "PRESENT" : "MISSING");
      console.log("- Final accessToken:", accessToken ? "PRESENT" : "MISSING");
      
      // Check if we've exceeded max hops
      if (peerConfig.maxPeerHops && newHopCount > peerConfig.maxPeerHops) {
        console.log("🔧 MAX HOPS REACHED - RETURNING TO SUPERVISOR");
        // Force return to supervisor
        return new Command({
          goto: supervisorName,
          graph: Command.PARENT,
          update: {
            ...state,
            accessToken, // Preserve auth token
            messages: state.messages.concat(
              toolMessage,
              new ToolMessage({
                content: `Maximum peer hops (${peerConfig.maxPeerHops}) reached. Returning to supervisor.`,
                name: toolName,
                tool_call_id: toolCallId + "_limit",
              })
            ),
            peerHopCount: 0, // Reset hop count
          },
        });
      }

      // // Add a human message with the task context for the target agent
      // const taskMessage = new HumanMessage({
      //   content: `Task from ${state.messages[state.messages.length - 1]?.name || 'peer agent'}: ${taskDescription}`,
      //   name: "peer_task_context",
      // });

      // Transfer directly to peer agent
      const updatedState = {
        ...state, // Preserve ALL existing state
        accessToken, // Include auth token
        messages: state.messages.concat(toolMessage),
        peerHopCount: newHopCount, // Track peer hops
      };
      
      console.log("🔧 PEER TRANSFER STATE:");
      console.log("- Updated accessToken:", updatedState.accessToken ? "PRESENT" : "MISSING");
      
      return new Command({
        goto: targetAgentName,
        graph: Command.PARENT,
        update: updatedState,
      });
    },
    {
      name: toolName,
      schema: z.object({
        task: z.string().describe("The specific task or question to ask the target agent. Provide clear context and requirements."),
        userInfo: z.object({
          userId: z.string().describe("The user's ID"),
          companyId: z.string().describe("The company's ID"),
          fullName: z.string().describe("The user's full name"),
          email: z.string().describe("The user's email"),
        }).describe("The user's information"),
        input: z.record(z.any()).optional().describe("Any additional input data or parameters in object format. Can contain any structure."),
      }),
      description: agentDescription || `Transfer directly to ${targetAgentName} agent for collaborative assistance. You MUST provide a clear task description.`,
    }
  );
}

/**
 * Create a tool to return to supervisor from peer communication
 */
export function createReturnToSupervisorTool(supervisorName: string) {
  const toolName = `return_to_${normalizeAgentName(supervisorName)}`;
  
  return tool(
    async (_, config) => {
      const toolCallId = config?.toolCall?.id;
      if (!toolCallId) {
        console.error("❌ ERROR: toolCall.id is undefined in return to supervisor tool", toolName);
        throw new Error(`Tool call ID is missing for ${toolName}`);
      }

      const toolMessage = new ToolMessage({
        content: `Returning to ${supervisorName}`,
        name: toolName,
        tool_call_id: toolCallId,
      });

      const state = getCurrentTaskInput() as MergedState;
      
      // Extract auth token from config if not in state
      const authTokenFromConfig = extractAuthFromConfig(config);
      const accessToken = state.accessToken || authTokenFromConfig;
      
      console.log("🔧 RETURN TO SUPERVISOR TOOL DEBUG:");
      console.log("- Supervisor:", supervisorName);
      console.log("- State accessToken:", state.accessToken ? "PRESENT" : "MISSING");
      console.log("- Config auth token:", authTokenFromConfig ? "PRESENT" : "MISSING");
      console.log("- Final accessToken:", accessToken ? "PRESENT" : "MISSING");
      
      const updatedState = {
        ...state,
        accessToken, // Preserve auth token
        messages: state.messages.concat(toolMessage),
        peerHopCount: 0, // Reset hop count when returning to supervisor
      };
      
      return new Command({
        goto: supervisorName,
        graph: Command.PARENT,
        update: updatedState,
      });
    },
    {
      name: toolName,
      schema: z.object({}),
      description: `Return control to the ${supervisorName} for task coordination.`,
    }
  );
}

/**
 * Create handoff back messages for return to supervisor
 */
export function createCustomHandoffBackMessages(agentName: string, supervisorName: string): [AIMessage, ToolMessage] {
  const toolCallId = uuidv4();
  const toolName = `transfer_back_to_${normalizeAgentName(supervisorName)}`;
  const toolCalls = [{ name: toolName, args: {}, id: toolCallId }];

  return [
    new AIMessage({
      content: `Transferring back to ${supervisorName}`,
      tool_calls: toolCalls,
      name: agentName,
    }),
    new ToolMessage({
      content: `Successfully transferred back to ${supervisorName}`,
      name: toolName,
      tool_call_id: toolCallId,
    }),
  ];
} 