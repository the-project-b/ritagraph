import {
  StateGraph,
  START,
  Annotation,
  MessagesAnnotation,
  END,
  AnnotationRoot,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { plan, planEdgeDecision } from "./nodes/plan.js";
import { reflect, reflectionEdggeDecision } from "./nodes/reflect.js";
import { output } from "./nodes/output.js";
import { emptyNode } from "../../../utility-nodes/empty-node.js";
import { Node, ToolInterface } from "../../shared-types/node-types.js";
import {
  AnnotationWithDefault,
  BaseGraphAnnotation,
} from "../../shared-types/base-annotation.js";
import { abortOutput } from "./nodes/abort-output.js";

export const workflowEngineState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  taskEngineMessages: MessagesAnnotation.spec.messages,
  decision: Annotation<"ACCEPT" | "IMPROVE" | undefined>(),
  reflectionStepCount: AnnotationWithDefault<number>(0),
  taskEngineLoopCounter: AnnotationWithDefault<number>(0),
  workflowEngineResponseDraft: Annotation<string | undefined>(),
});
export type WorkflowEngineStateType = typeof workflowEngineState.State;

export type WorkflowEngineNode = Node<WorkflowEngineStateType, any>;

type BuildWorkflowEngineReActParams = {
  fetchTools: (
    companyId: string,
    config: AnnotationRoot<any>
  ) => Promise<Array<ToolInterface>>;
  preWorkflowResponse?: WorkflowEngineNode;
  quickUpdateNode?: WorkflowEngineNode;
  configAnnotation: AnnotationRoot<any>;
};

export function buildWorkflowEngineReAct({
  fetchTools,
  preWorkflowResponse,
  configAnnotation,
  quickUpdateNode,
}: BuildWorkflowEngineReActParams) {
  // Updated toolsNode to fetch authenticated tools at runtime
  const toolsNode: WorkflowEngineNode = async (state, config) => {
    try {
      const tools = await fetchTools(state.selectedCompanyId, config);
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
  let subGraph = new StateGraph(workflowEngineState, configAnnotation);

  subGraph
    .addNode("preWorkflowResponse", preWorkflowResponse ?? emptyNode)
    .addNode("plan", plan(fetchTools))
    .addNode("reflect", reflect)
    .addNode("output", output)
    .addNode("abortOutput", abortOutput)
    .addNode("tools", toolsNode)
    .addNode("quickUpdate", quickUpdateNode ?? emptyNode)
    .addEdge(START, "preWorkflowResponse")
    .addEdge("preWorkflowResponse", "plan")
    .addEdge("tools", "plan")
    .addEdge("reflect", "quickUpdate")
    .addConditionalEdges("plan", planEdgeDecision, ["tools", "reflect"])
    .addConditionalEdges("reflect", reflectionEdggeDecision, [
      "plan",
      "output",
      "abortOutput",
    ])
    .addEdge("abortOutput", END)
    .addEdge("output", END);
  return subGraph.compile();
}
