import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

// Import placeholders to ensure they're registered
import "../../placeholders/index";

import { MergedAnnotation } from "../../states/states";
import { AgentType } from "./types/agents";
import { supervisorAgent } from "./agents/supervisor-agent";
import {
  queryDiscoveryNode,
  intentMatchingNode,
  contextGatheringNode,
  queryExecutionNode,
  typeDiscoveryNode,
  queryGenerationNode,
  resultFormattingNode,
  mutationDiscoveryNode,
  mutationExecutionNode,
  mutationGenerationNode,
  initialPlanNode,
} from "./nodes";

// Tool node is now imported from ./tools/tool-node

const create_multi_agent_rita_graph = async () => {
  try {
    console.log("Initializing Multi-Agent RITA Graph...");

    // Create the nodes
    const workflow = new StateGraph(MergedAnnotation)
      .addNode(AgentType.SUPERVISOR, supervisorAgent, {
        ends: ["INITIAL_PLAN", "QUERY_DISCOVERY", "MUTATION_DISCOVERY", END],
      })
      // Initial plan node
      .addNode("INITIAL_PLAN", initialPlanNode, {
        ends: [AgentType.SUPERVISOR],
      })
      // Query flow nodes
      .addNode("QUERY_DISCOVERY", queryDiscoveryNode, {
        ends: ["INTENT_MATCHING"],
      })
      .addNode("INTENT_MATCHING", intentMatchingNode, {
        ends: ["TYPE_DISCOVERY"],
      })
      .addNode("TYPE_DISCOVERY", typeDiscoveryNode, {
        ends: ["CONTEXT_GATHERING"],
      })
      .addNode("CONTEXT_GATHERING", contextGatheringNode, {
        ends: ["QUERY_GENERATION", "MUTATION_GENERATION"],
      })
      .addNode("QUERY_GENERATION", queryGenerationNode, {
        ends: ["QUERY_EXECUTION"],
      })
      .addNode("QUERY_EXECUTION", queryExecutionNode, {
        ends: ["RESULT_FORMATTING"],
      })
      // Mutation flow nodes
      .addNode("MUTATION_DISCOVERY", mutationDiscoveryNode, {
        ends: ["INTENT_MATCHING"],
      })
      .addNode("MUTATION_GENERATION", mutationGenerationNode, {
        ends: ["MUTATION_EXECUTION"],
      })
      .addNode("MUTATION_EXECUTION", mutationExecutionNode, {
        ends: ["RESULT_FORMATTING"],
      })
      // Results
      .addNode("RESULT_FORMATTING", resultFormattingNode, {
        ends: [AgentType.SUPERVISOR],
      })
      .addEdge(START, AgentType.SUPERVISOR);
    // Note: Removed unconditional edges from TOOL node - routing is handled by Command.goto

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({
      checkpointer: memory,
    });

    graph.name = "Supervisor Agent";

    return graph;
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

// All query logic is now in dedicated nodes under ./nodes/

export { create_multi_agent_rita_graph };
