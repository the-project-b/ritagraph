import {
  AnnotationRoot,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
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
import { getAuthUser } from "../../security/auth.js";
import { quickUpdate } from "./nodes/communication-nodes/quick-update.js";
import { ToolInterface } from "../shared-types/node-types.js";

async function fetchTools(
  companyId: string,
  config: AnnotationRoot<any>
): Promise<Array<ToolInterface>> {
  const authUser = await getAuthUser(config);
  const mcpClient = createMcpClient({
    accessToken: authUser.token,
    companyId: companyId,
  });
  const tools = await mcpClient.getTools();
  return tools;
}

const graph = async () => {
  try {
    console.log("Initializing Dynamic Multi-Agent RITA Graph...");

    const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
      // => Nodes
      .addNode("loadSettings", loadSettings)
      .addNode("router", router)
      .addNode("quickResponse", quickResponse)
      .addNode(
        "workflowEngine",
        buildWorkflowEngineReAct({
          fetchTools,
          configAnnotation: ConfigurableAnnotation,
          quickUpdateNode: quickUpdate,
          preWorkflowResponse: preWorkflowResponse,
        })
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
    console.error("Error:", error);
    process.exit(1);
  }
};

// All query logic is now in dedicated nodes under ./nodes/

export { graph };
