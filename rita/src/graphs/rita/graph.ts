import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";

// Import placeholders to ensure they're registered
import "../../placeholders/index";

import { tempAgent } from "./nodes";
import { ConfigurableAnnotation, GraphState } from "./graph-state";

const graph = async () => {
  try {
    console.log("Initializing Dynamic Multi-Agent RITA Graph...");

    // Create the nodes
    const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
      .addNode("temp_agent", tempAgent, {
        ends: [END],
      })
      .addEdge(START, "temp_agent");

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
