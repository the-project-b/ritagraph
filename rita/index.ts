// Main export file for Rita V2 graphs package
// This file exports all graphs defined in langgraph.json for use in evaluation

import * as langgraphConfig from "./langgraph.json";

export { create_multi_agent_rita_graph } from "./src/legacy-graphs/multi-agent/multi-agent-test.js";
export { create_multi_agent_rita_graph as create_multi_agent_dynamic_rita_graph } from "./src/legacy-graphs/multi-agent/multi-agent-dynamic.js";

// Export available graph types directly from langgraph.json
export const AVAILABLE_GRAPHS = langgraphConfig.graphs;

export type GraphName = keyof typeof AVAILABLE_GRAPHS;
