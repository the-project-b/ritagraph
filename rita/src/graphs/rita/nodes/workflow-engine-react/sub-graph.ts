import {
  StateGraph,
  START,
  Annotation,
  MessagesAnnotation,
  END,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { GraphState, ConfigurableAnnotation, Node } from "../../graph-state.js";
import { plan, planEdgeDecision } from "./nodes/plan.js";
import { reflect, reflectionEdggeDecision } from "./nodes/reflect.js";
import { output } from "./nodes/output.js";
import { preWorkflowResponse } from "../communication-nodes/pre-workflow-response.js";
import { quickUpdate } from "./nodes/communication-nodes/quick-update.js";
import { createMcpClient } from "../../../../mcp/client.js";
import { getAuthUser } from "../../../../security/auth.js";

export type TaskExecutionLog = {
  taskDescription: string;
  result?: string;
  error?: string;
};

export const WorkflowPlannerState = Annotation.Root({
  ...GraphState.spec,
  taskEngineMessages: MessagesAnnotation.spec.messages,
  decision: Annotation<"ACCEPT" | "IMPROVE" | undefined>(),
});

export type WorkflowEngineNode = Node<typeof WorkflowPlannerState.State>;

export const buildWorkflowEngineReAct = () => {
  // Updated toolsNode to fetch authenticated tools at runtime
  const toolsNode: WorkflowEngineNode = async (state, config) => {
    try {
      const authUser = await getAuthUser(config);
      const mcpClient = createMcpClient({
        accessToken: authUser.token,
        companyId: state.selectedCompanyId,
      });
      const tools = await mcpClient.getTools();

      const toolNode = new ToolNode(tools);
      const result = await toolNode.invoke({
        messages: state.taskEngineMessages,
      });
      return {
        taskEngineMessages: [...result.messages],
      };
    } catch (error) {
      console.error("[TOOLS NODE] Error:", error);
      return {
        taskEngineMessages: state.taskEngineMessages,
      };
    }
  };

  /**
   * The general idea is to use a Re-Act pattern to contionusly improve the response
   * In order to properly reason it can communciate in its own messageing system.
   */
  let subGraph = new StateGraph(WorkflowPlannerState, ConfigurableAnnotation);

  subGraph
    .addNode("preWorkflowResponse", preWorkflowResponse)
    .addNode("plan", plan)
    .addNode("reflect", reflect)
    .addNode("output", output)
    .addNode("tools", toolsNode)
    .addNode("quickUpdate", quickUpdate)
    .addEdge(START, "preWorkflowResponse")
    .addEdge("preWorkflowResponse", "plan")
    .addEdge("tools", "plan")
    .addEdge("reflect", "quickUpdate")
    .addConditionalEdges("plan", planEdgeDecision, ["tools", "reflect"])
    .addConditionalEdges("reflect", reflectionEdggeDecision, ["plan", "output"])
    .addEdge("output", END);
  return subGraph.compile();
};
