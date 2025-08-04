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
import {
  mutationEngine,
  findEmployee,
  getEmployeeById,
  getCurrentUser,
} from "../../tools/index.js";
import { toolFactory } from "../../tools/tool-factory.js";
import { dataRetrievalEngine } from "../../tools/subgraph-tools/data-retrieval-engine/tool.js";

async function fetchTools(
  companyId: string,
  config: AnnotationRoot<any>
): Promise<Array<ToolInterface>> {
  const authUser = getAuthUser(config);
  const mcpClient = createMcpClient({
    accessToken: authUser.token,
    companyId: companyId,
  });
  const mcpTools = await mcpClient.getTools();
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

  const toolsToExclude = ["find-employee-by-name", "get-current-user"];

  const filteredMcpTools = mcpTools.filter(
    (tool) => !toolsToExclude.includes(tool.name)
  );
  console.log(filteredMcpTools);

  return [...tools];
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
        }),
        {
          ends: ["finalMessage"],
        }
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
