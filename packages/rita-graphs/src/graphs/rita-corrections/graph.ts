import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { createLogger } from "@the-project-b/logging";
import { ConfigurableAnnotation, GraphState, Node } from "./graph-state.js";
import { loadOriginalProposal, processCorrection } from "./nodes/index.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "CorrectionsGraphInitialization",
  graph: "rita-corrections",
});

export function createRitaCorrectionsGraph(getAuthUser: (config: any) => any) {
  return async () => {
    try {
      logger.info("Initializing Rita Corrections Graph...");

      const wrapNodeWithAuth = (node: Node) => {
        return async (state, config) => {
          return node(state, config, getAuthUser);
        };
      };

      const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
        .addNode("loadOriginalProposal", wrapNodeWithAuth(loadOriginalProposal))
        .addNode("processCorrection", wrapNodeWithAuth(processCorrection))
        .addEdge(START, "loadOriginalProposal")
        .addEdge("loadOriginalProposal", "processCorrection")
        .addEdge("processCorrection", END);

      // Compile the graph
      const memory = new MemorySaver();
      const graph = workflow.compile({
        checkpointer: memory,
      });

      // Set graph name
      graph.name = `RitaCorrections`;

      return graph;
    } catch (error) {
      logger.error("Failed to initialize Rita Corrections graph", error, {
        operation: "createRitaCorrectionsGraph",
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };
}
