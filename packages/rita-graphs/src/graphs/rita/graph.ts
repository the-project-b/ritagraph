import {
  AnnotationRoot,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { createLogger } from "@the-project-b/logging";
import { ConfigurableAnnotation, GraphState, Node } from "./graph-state.js";
import {
  router,
  finalMessage,
  quickResponse,
  preWorkflowResponse,
} from "./nodes/index.js";
import { routerEdgeDecision } from "./nodes/router.js";
import { loadSettings } from "./nodes/load-settings.js";
import { generateTitle } from "./nodes/generate-title.js";
import { buildWorkflowEngineReAct } from "../shared-sub-graphs/workflow-engine-react/sub-graph.js";
// import { createMcpClient } from "../../mcp/client.js";
// Remove direct import - getAuthUser will be passed as parameter
import { quickUpdate } from "./nodes/communication-nodes/quick-update.js";
import { ToolInterface } from "../shared-types/node-types.js";
import {
  mutationEngine,
  getEmployeeById,
  getCurrentUser,
  generateThreadTitle,
} from "../../tools/index.js";
import { toolFactory } from "../../tools/tool-factory.js";
import { dataRetrievalEngine } from "../../tools/subgraph-tools/data-retrieval-engine/tool.js";
import { findEmployee } from "../../tools/find-employee/tool.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "GraphInitialization",
  graph: "rita",
});

function createFetchTools(getAuthUser: (config: any) => any) {
  return async function fetchTools(
    companyId: string,
    config: AnnotationRoot<any>,
  ): Promise<Array<ToolInterface>> {
    const authUser = getAuthUser(config);

    const toolContext = {
      accessToken: authUser.token,
      selectedCompanyId: companyId,
      appdataHeader: authUser.appdataHeader, // Pass appdata header for impersonation
    };

    const tools = toolFactory<undefined>({
      toolDefintions: [
        mutationEngine,
        dataRetrievalEngine,
        findEmployee,
        getEmployeeById,
        getCurrentUser,
        generateThreadTitle,
      ],
      ctx: toolContext,
    });

    return [...tools];
  };
}

export function createRitaGraph(getAuthUser: (config: any) => any) {
  return async () => {
    try {
      logger.info("Initializing Dynamic Multi-Agent RITA Graph...");

      const wrapNodeWithAuth = (node: Node) => {
        return async (state, config) => {
          return node(state, config, getAuthUser);
        };
      };

      const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
        // => Nodes
        .addNode("loadSettings", wrapNodeWithAuth(loadSettings))
        .addNode("generateTitle", wrapNodeWithAuth(generateTitle))
        .addNode("router", wrapNodeWithAuth(router))
        .addNode("quickResponse", wrapNodeWithAuth(quickResponse))
        .addNode(
          "workflowEngine",
          buildWorkflowEngineReAct({
            fetchTools: createFetchTools(getAuthUser),
            configAnnotation: ConfigurableAnnotation,
            quickUpdateNode: quickUpdate,
            preWorkflowResponse,
          }),
          {
            ends: ["finalMessage"],
          },
        )
        .addNode("finalMessage", wrapNodeWithAuth(finalMessage))
        // => Edges
        .addEdge(START, "loadSettings")
        // 'conditional edge' but the flow triggers both options because then we ran the generateTitle node async to the normal flow
        .addConditionalEdges(
          "loadSettings",
          (_state) => {
            return ["router", "generateTitle"];
          },
          ["router", "generateTitle"],
        )
        .addConditionalEdges("router", routerEdgeDecision, [
          "quickResponse",
          "workflowEngine",
        ])
        .addEdge("workflowEngine", "finalMessage")
        .addEdge("finalMessage", END)
        .addEdge("generateTitle", END);

      // Compile the graph
      const memory = new MemorySaver();
      const graph = workflow.compile({
        checkpointer: memory,
      });

      // Add version read from the package.json file
      graph.name = `Rita`;

      return graph;
    } catch (error) {
      logger.error("Failed to initialize Rita graph", error, {
        operation: "createRitaGraph",
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };
}

// All query logic is now in dedicated nodes under ./nodes/

// Keep backward compatibility - export the direct graph for existing consumers
export const graph = async () => {
  // This should not be used when auth is required
  throw new Error(
    "Use createRitaGraph() factory function for auth-enabled graphs",
  );
};
