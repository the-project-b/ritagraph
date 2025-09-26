import {
  AnnotationRoot,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { createLogger } from "@the-project-b/logging";
import {
  ConfigurableAnnotation,
  EdgeDecision,
  GraphState,
  Node,
} from "./graph-state.js";
import {
  router,
  finalMessage,
  quickResponse,
  preWorkflowResponse,
  finalMessageForChanges,
} from "./nodes/index.js";
import { routerEdgeDecision } from "./nodes/router.js";
import {
  loadSettings,
  routingDecision as routingDecisionFromLoadSettings,
} from "./nodes/load-settings.js";
import { generateTitle } from "./nodes/generate-title.js";
import { buildWorkflowEngineReAct } from "../shared-sub-graphs/workflow-engine-react/sub-graph.js";
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
import { finalMessageEdgeDecision } from "./nodes/communication-nodes/final-message-edge-decision.js";
import AgentActionLogger from "../../utils/agent-action-logger/AgentActionLogger.js";
import { askUserAQuestion } from "../../tools/ask-user-a-question/tool.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "GraphInitialization",
  graph: "rita",
});

function createFetchTools(getAuthUser: (config: any) => any) {
  return async function fetchTools(
    companyId: string,
    config: AnnotationRoot<any>,
    agentActionLogger: AgentActionLogger,
  ): Promise<Array<ToolInterface>> {
    const authUser = getAuthUser(config);

    const toolContext = {
      accessToken: authUser.token,
      selectedCompanyId: companyId,
      appdataHeader: authUser.appdataHeader,
      agentActionLogger,
    };

    const tools = toolFactory<undefined>({
      toolDefinitions: [
        mutationEngine,
        dataRetrievalEngine,
        findEmployee,
        getEmployeeById,
        getCurrentUser,
        askUserAQuestion,
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

      const wrapEdgeDecisionWithAuth = (edgeDecision: EdgeDecision) => {
        return async (state, config) => {
          return edgeDecision(state, config, getAuthUser);
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
            getAuthUser,
          }),
          {
            ends: ["finalMessage", "finalMessageForChanges"],
          },
        )
        .addNode("finalMessage", wrapNodeWithAuth(finalMessage))
        .addNode(
          "finalMessageForChanges",
          wrapNodeWithAuth(finalMessageForChanges),
        )
        .addEdge(START, "loadSettings")
        .addConditionalEdges("loadSettings", routingDecisionFromLoadSettings, [
          "generateTitle",
          "router",
        ])
        .addConditionalEdges("router", routerEdgeDecision, [
          "quickResponse",
          "workflowEngine",
        ])
        .addConditionalEdges(
          "workflowEngine",
          wrapEdgeDecisionWithAuth(finalMessageEdgeDecision),
          ["finalMessageForChanges", "finalMessage"],
        )
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
