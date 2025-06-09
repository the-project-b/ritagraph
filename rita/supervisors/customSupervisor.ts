import { START, StateGraph } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { CustomSupervisorConfig, AgentConfig } from "../placeholders/types.js";
import { createCustomHandoffTool } from "../tools/handoffTools.js";
import { createAgentWrapper } from "../agents/supervisorAgents.js";

/**
 * Create a custom supervisor with full state control and optional peer-to-peer communication
 * Following the same pattern as the original langgraph-supervisor
 */
export function createCustomSupervisor({
  agents,
  llm,
  supervisorName = "supervisor",
  prompt = "You are a team supervisor managing specialized agents. Analyze the user's request and delegate to the most appropriate agent.",
  outputMode = "last_message",
  addHandoffBackMessages = true,
  stateSchema,
  peerCommunication,
}: CustomSupervisorConfig) {
  
  // Validate agent names are unique
  const agentNames = new Set<string>();
  for (const agentConfig of agents) {
    if (!agentConfig.agent.name) {
      throw new Error(`Please specify a name when you create your agent '${agentConfig.name}', either via createReactAgent({ ..., name: agentName }) or via graph.compile({ name: agentName }).`);
    }
    if (agentNames.has(agentConfig.name)) {
      throw new Error(`Agent with name '${agentConfig.name}' already exists. Agent names must be unique.`);
    }
    agentNames.add(agentConfig.name);
  }

  // Validate peer communication configuration
  if (peerCommunication?.enabled) {
    for (const agentConfig of agents) {
      if (agentConfig.canTalkTo) {
        for (const peerName of agentConfig.canTalkTo) {
          if (!agentNames.has(peerName)) {
            throw new Error(`Agent '${agentConfig.name}' is configured to talk to '${peerName}', but no such agent exists.`);
          }
          if (peerName === agentConfig.name) {
            throw new Error(`Agent '${agentConfig.name}' cannot talk to itself.`);
          }
        }
      }
    }
    
    console.log("---PEER COMMUNICATION ENABLED---");
    console.log(`Max peer hops: ${peerCommunication.maxPeerHops || 'unlimited'}`);
    console.log(`Always return to supervisor: ${peerCommunication.alwaysReturnToSupervisor ?? true}`);
    
    // Log peer communication matrix
    for (const agentConfig of agents) {
      if (agentConfig.canTalkTo && agentConfig.canTalkTo.length > 0) {
        console.log(`${agentConfig.name} can talk to: ${agentConfig.canTalkTo.join(', ')}`);
      }
    }
  }

  const agentNamesList = Array.from(agentNames);

  // Create handoff tools for each agent (supervisor tools)
  const handoffTools = agents.map(agentConfig => 
    createCustomHandoffTool(agentConfig.name, agentConfig.description)
  );

  // Enhance the supervisor prompt if peer communication is enabled
  let enhancedPrompt = prompt;
  if (peerCommunication?.enabled) {
    const peerCommunicationInfo = agents
      .filter(a => a.canTalkTo && a.canTalkTo.length > 0)
      .map(a => `${a.name} can collaborate with: ${a.canTalkTo!.join(', ')}`)
      .join('\n');

    if (peerCommunicationInfo) {
      enhancedPrompt += `\n\nPeer Communication Enabled:
${peerCommunicationInfo}

When delegating tasks, consider that agents can collaborate directly with their peers before returning to you. This can be more efficient for complex multi-step tasks.`;
    }
  }

  // Create the supervisor agent with handoff tools
  const supervisorAgent = createReactAgent({
    name: supervisorName,
    llm: llm.bindTools(handoffTools, { parallel_tool_calls: false }),
    tools: handoffTools,
    prompt: new SystemMessage(enhancedPrompt),
    stateSchema,
  });

  // Build the state graph exactly like the original langgraph-supervisor
  let builder = new StateGraph(stateSchema)
    .addNode(supervisorName, supervisorAgent, {
      ends: agentNamesList, // Allow ending at any agent
    })
    .addEdge(START, supervisorName);

  // Add each agent as a node with proper peer communication support
  for (const agentConfig of agents) {
    const wrappedAgent = createAgentWrapper(
      agentConfig.agent,
      agentConfig, // Pass full config for peer communication
      outputMode,
      addHandoffBackMessages,
      supervisorName,
      agents, // Pass all agents for peer validation
      peerCommunication // Pass peer communication config
    );

    builder = builder
      .addNode(agentConfig.name, wrappedAgent, {
        subgraphs: [agentConfig.agent], // Include the original agent as subgraph
      });

    // Conditional edge back to supervisor
    if (peerCommunication?.enabled && !peerCommunication.alwaysReturnToSupervisor) {
      // Don't force return to supervisor - agent can choose
      // The agent wrapper will handle routing decisions
    } else {
      // Always return to supervisor (default behavior)
      builder = builder.addEdge(agentConfig.name, supervisorName);
    }
  }

  return builder;
} 