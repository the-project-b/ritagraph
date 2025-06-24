import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

// Import placeholders to ensure they're registered
import "../../placeholders/index";

import { router, workflowEngine } from "./nodes";
import { ConfigurableAnnotation, GraphState } from "./graph-state";
import { finalNode } from "./nodes/final-node";
import { directResponse } from "./nodes/communication-nodes/direct-response";

const graph = async () => {
  try {
    console.log("Initializing Dynamic Multi-Agent RITA Graph...");

    // Create the nodes
    const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
      .addNode("router", router)
      .addNode("directResponse", directResponse)
      .addNode("workflowEngine", workflowEngine)
      .addNode("finalNode", finalNode)
      .addEdge(START, "router")
      .addEdge(START, "directResponse")
      .addEdge("router", "workflowEngine")
      .addEdge("workflowEngine", "finalNode")
      .addEdge("finalNode", END);

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({
      checkpointer: memory,
    });

    graph.name = "Rita";

    return graph;
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

// All query logic is now in dedicated nodes under ./nodes/

export { graph };
