import {
  AnnotationRoot,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { createLogger } from "@the-project-b/logging";
import { ConfigurableAnnotation, GraphState } from "./graph-state.js";
import {
  router,
  finalMessage,
  quickResponse,
  preWorkflowResponse,
} from "./nodes/index.js";
import { routerEdgeDecision } from "./nodes/router.js";
import { loadSettings } from "./nodes/load-settings.js";
import { buildWorkflowEngineReAct } from "../shared-sub-graphs/workflow-engine-react/sub-graph.js";
import { createMcpClient } from "../../mcp/client.js";
// Remove direct import - getAuthUser will be passed as parameter
import { quickUpdate } from "./nodes/communication-nodes/quick-update.js";
import { ToolInterface } from "../shared-types/node-types.js";
import {
  mutationEngine,
  getEmployeeById,
  getCurrentUser,
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
    // const mcpClient = createMcpClient({
    //   accessToken: authUser.token,
    //   companyId,
    // });
    // const mcpTools = await mcpClient.getTools();
    const toolContext = {
      accessToken: authUser.token,
      selectedCompanyId: companyId,
    };

    const tools = toolFactory<undefined>({
      toolDefintions: [
        mutationEngine,
        dataRetrievalEngine,
        findEmployee,
        getEmployeeById,
        getCurrentUser,
      ],
      ctx: toolContext,
    });

    // const toolsToExclude = ["find-employee-by-name", "get-current-user"];

    // const filteredMcpTools = mcpTools.filter(
    //   (tool) => !toolsToExclude.includes(tool.name),
    // );

    return [...tools];
  };
}

export function createRitaGraph(getAuthUser: (config: any) => any) {
  return async () => {
    try {
      logger.info("Initializing Dynamic Multi-Agent RITA Graph...");

      const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
        // => Nodes
        .addNode("loadSettings", (state, config) =>
          loadSettings(state, config, getAuthUser),
        )
        .addNode("router", router)
        .addNode("quickResponse", quickResponse)
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
        .addNode("finalMessage", finalMessage)
        // => Edges
        .addEdge(START, "loadSettings")
        .addEdge("loadSettings", "router")
        .addConditionalEdges("router", routerEdgeDecision, [
          "quickResponse",
          "workflowEngine",
        ])
        .addEdge("workflowEngine", "finalMessage")
        .addEdge("finalMessage", END);

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
        errorType: error instanceof Error ? error.constructor.name : "UnknownError",
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
