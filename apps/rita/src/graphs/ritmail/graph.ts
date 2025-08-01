import {
  AnnotationRoot,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ConfigurableAnnotation, GraphState } from "./graph-state.js";
import { finalNode, quickResponse } from "./nodes/index.js";
import { loadContext } from "./nodes/load-context.js";
import { buildWorkflowEngineReAct } from "../shared-sub-graphs/workflow-engine-react/sub-graph.js";
import { ToolInterface } from "../shared-types/node-types.js";
import { createMcpClient } from "../../mcp/client.js";
import { getAuthUser } from "../../security/auth.js";

async function fetchTools(
  companyId: string,
  config: AnnotationRoot<any>
): Promise<Array<ToolInterface>> {
  const authUser = await getAuthUser(config);
  const mcpClient = createMcpClient({
    accessToken: authUser.token,
    companyId,
  });
  const tools = await mcpClient.getTools();
  return tools;
}

const graph = async () => {
  try {
    console.log("Initializing Dynamic Multi-Agent RITA Graph...");

    const workflow = new StateGraph(GraphState, ConfigurableAnnotation)
      // => Nodes
      .addNode("loadContext", loadContext)
      .addNode("quickResponse", quickResponse)
      .addNode(
        "workflowEngine",
        buildWorkflowEngineReAct({
          fetchTools,
          configAnnotation: ConfigurableAnnotation,
        })
      )
      .addNode("finalNode", finalNode)
      // => Edges
      .addEdge(START, "loadContext")
      .addEdge("loadContext", "workflowEngine")
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
