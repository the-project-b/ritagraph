import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ConfigurableAnnotation, GraphState } from "./graph-state";
import { router, finalNode, workflowEngineReAct, quickResponse } from "./nodes";
import { routerEdgeDecision } from "./nodes/router";

const graph = async () => {
  try {
    console.log("Initializing Dynamic Multi-Agent RITA Graph...");

    // Create the nodes
    const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
      .addNode("router", router)
      .addNode("quickResponse", quickResponse)
      .addNode("workflowEngine", workflowEngineReAct)
      .addNode("finalNode", finalNode)

      .addEdge(START, "router")
      .addConditionalEdges("router", routerEdgeDecision, [
        "quickResponse",
        "workflowEngine",
      ])
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
