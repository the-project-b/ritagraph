import {
  StateGraph,
  START,
  Annotation,
  MessagesAnnotation,
  END,
} from "@langchain/langgraph";
import { StructuredToolInterface } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { GraphState, ConfigurableAnnotation, Node } from "../../graph-state.js";
import { plan, planEdgeDecision } from "./nodes/plan.js";
import { reflect, reflectionEdggeDecision } from "./nodes/reflect.js";
import { output } from "./nodes/output.js";
import { preWorkflowResponse } from "../communication-nodes/pre-workflow-response.js";
import { quickUpdate } from "./nodes/communication-nodes/quick-update.js";

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

export const buildWorkflowEngineReAct = (
  tools: Array<StructuredToolInterface>
) => {
  // Wrap the tool node to be able to not use the standard message channel...
  const toolsNode: WorkflowEngineNode = async (state) => {
    const toolNode = new ToolNode(tools);
    const result = await toolNode.invoke({
      messages: state.taskEngineMessages,
    });
    return {
      taskEngineMessages: [...result.messages],
    };
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
