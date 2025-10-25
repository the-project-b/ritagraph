import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { createLogger } from "@the-project-b/logging";
import { ConfigurableAnnotation, GraphState, Node } from "./graph-state.js";
import {
  startExtractionJobs,
  pollJobStatuses,
  retrieveResults,
  formatOutput,
} from "./nodes/index.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "FileExtractionGraphInitialization",
  graph: "file-extraction",
});

export function createFileExtractionGraph(getAuthUser: (config: any) => any) {
  return async () => {
    try {
      logger.info("Initializing File Extraction Graph...");

      const wrapNodeWithAuth = (node: Node) => {
        return async (state, config) => {
          return node(state, config, getAuthUser);
        };
      };

      const shouldContinuePolling = (state: typeof GraphState.State) => {
        const allComplete = state.extractionJobs.every(
          (job) => job.status === "SUCCEEDED" || job.status === "FAILED",
        );
        return allComplete ? "retrieveResults" : "pollJobStatuses";
      };

      const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
        .addNode("startExtractionJobs", wrapNodeWithAuth(startExtractionJobs))
        .addNode("pollJobStatuses", wrapNodeWithAuth(pollJobStatuses))
        .addNode("retrieveResults", wrapNodeWithAuth(retrieveResults))
        .addNode("formatOutput", wrapNodeWithAuth(formatOutput))
        .addEdge(START, "startExtractionJobs")
        .addEdge("startExtractionJobs", "pollJobStatuses")
        .addConditionalEdges("pollJobStatuses", shouldContinuePolling, [
          "pollJobStatuses",
          "retrieveResults",
        ])
        .addEdge("retrieveResults", "formatOutput")
        .addEdge("formatOutput", END);

      const memory = new MemorySaver();
      const graph = workflow.compile({
        checkpointer: memory,
      });

      graph.name = `FileExtraction`;

      return graph;
    } catch (error) {
      logger.error("Failed to initialize File Extraction graph", error, {
        operation: "createFileExtractionGraph",
        errorType: error instanceof Error ? error.constructor.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };
}
