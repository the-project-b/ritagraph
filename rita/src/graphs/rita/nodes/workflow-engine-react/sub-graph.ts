import {
  StateGraph,
  START,
  Annotation,
  MessagesAnnotation,
  END,
} from "@langchain/langgraph";
import { GraphState, ConfigurableAnnotation, Node } from "../../graph-state";

import { ToolNode } from "@langchain/langgraph/prebuilt";

import { plan, planEdgeDecision } from "./nodes/plan";
import { reflect, reflectionEdggeDecision } from "./nodes/reflect";
import { output } from "./nodes/output";

import { preWorkflowResponse } from "../communication-nodes/pre-workflow-response";
import { availableTools } from "./tools";

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

//const tools = new ToolNode(availableTools);

// Wrap the tool node to be able to not use the standard message channel...
const tools: WorkflowEngineNode = async (state) => {
  const toolNode = new ToolNode(availableTools);
  const result = await toolNode.invoke({ messages: state.taskEngineMessages });
  return {
    taskEngineMessages: [...result.messages],
  };
};

/**
 * The general idea is to use a Re-Act pattern to contionusly improve the response
 * In order to properly reason it can communciate in its own messageing system.
 */
let subGraph = new StateGraph(WorkflowPlannerState, ConfigurableAnnotation);

const noOpNode: WorkflowEngineNode = async () => {
  return {};
};

subGraph
  .addNode("entry", noOpNode)
  .addNode("preWorkflowResponse", preWorkflowResponse)
  .addNode("plan", plan)
  .addNode("reflect", reflect)
  .addNode("output", output)
  .addNode("tools", tools)
  .addEdge(START, "entry")
  .addEdge("entry", "preWorkflowResponse")
  .addEdge("entry", "plan")
  .addEdge("tools", "plan")
  .addConditionalEdges("plan", planEdgeDecision, ["tools", "reflect"])
  .addConditionalEdges("reflect", reflectionEdggeDecision, ["plan", "output"])
  .addEdge("output", END);

export const workflowEngineReAct = subGraph.compile();
