import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { GraphState, ConfigurableAnnotation, Node } from "../../graph-state";
import { workflowPlanner } from "./nodes/workflow-planner";
import { taskExecutor } from "./nodes/task-executor";
import { workflowCompletion } from "./nodes/workflow-completion";
import { queryEngine } from "../query-engine/sub-graph";

export type TaskExecutionLog = {
  taskDescription: string;
  result?: string;
  error?: string;
};

export const WorkflowPlannerState = Annotation.Root({
  ...GraphState.spec,
  decision: Annotation<"ACCEPT" | "IMPROVE" | undefined>(),
  suggestion: Annotation<string | undefined>(),
  taskDescriptionsDraft: Annotation<Array<string> | undefined>(),
  reflectionLoopCounter: Annotation<number | undefined>(),
  taskExecutionLog: Annotation<Array<TaskExecutionLog> | undefined>(),
  taskIndex: Annotation<number | undefined>(),
});

export type WorkflowEngineNode = Node<typeof WorkflowPlannerState.State>;

// Create the subgraph
export const workflowEngine = new StateGraph(
  WorkflowPlannerState,
  ConfigurableAnnotation
)
  .addNode("workflowPlanner", workflowPlanner)
  //.addNode("reflection", reflectionNode)
  .addNode("taskExecutor", taskExecutor)
  .addNode("queryEngine", queryEngine)
  .addNode("workflowCompletion", workflowCompletion)
  .addEdge(START, "workflowPlanner")
  .addEdge("workflowPlanner", "taskExecutor")
  .addEdge("taskExecutor", "queryEngine")
  .addEdge("queryEngine", "taskExecutor")
  /*.addConditionalEdges("reflection", (state) => {
    // If we have taskDescriptions in state, we're done
    if (state.decision === "IMPROVE") {
      return "workflowPlanner";
    }
    return "taskExecutor";
  })*/
  .addConditionalEdges("taskExecutor", (state) => {
    if (state.taskIndex < state.taskDescriptions.length) {
      return "taskExecutor";
    }
    return "workflowCompletion";
  })
  .addEdge("workflowCompletion", END)
  .compile();
