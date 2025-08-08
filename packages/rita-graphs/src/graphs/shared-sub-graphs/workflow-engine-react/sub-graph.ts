import {
  StateGraph,
  START,
  Annotation,
  END,
  AnnotationRoot,
  MessagesAnnotation,
  isCommand,
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
import { isAIMessage } from "@langchain/core/messages";
import { createLogger } from "@the-project-b/logging";

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
    config: AnnotationRoot<any>,
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
  const logger = createLogger({ service: "rita-graphs" }).child({
    module: "WorkflowEngine",
    component: "SubGraph",
  });

  // Updated toolsNode to fetch authenticated tools at runtime

  const toolsNode: WorkflowEngineNode = async (state, config) => {
    try {
      const message = state.taskEngineMessages.at(-1);
      if (
        !isAIMessage(message) ||
        message.tool_calls === undefined ||
        message.tool_calls.length === 0
      ) {
        throw new Error(
          "Most recent message must be an AIMessage with a tool call.",
        );
      }

      const tools = await fetchTools(state.selectedCompanyId, config);
      const toolNode = new ToolNode(tools);
      const result = await toolNode.invoke({
        messages: state.taskEngineMessages,
      });

      // The result of the tool node is a bit messy.

      // Handle mixed Command and non-Command outputs
      if (Array.isArray(result)) {
        // We do not support goto at the moment
        // For arrays, we need to handle Commands and state updates separately
        const commands = result.filter(isCommand);
        const updates = [];
        commands.forEach((item) => {
          updates.push(item.update);
        });


        return {
          taskEngineMessages: updates.map((update) => update.messages).flat(),
          dataRepresentationLayerStorage: updates.reduce(
            (acc, update) => ({
              ...acc,
              ...update.dataRepresentationLayerStorage,
            }),
            {},
          ),
        };
      }

      // Handle single result (backwards compatibility)
      if ("messages" in result) {
        return {
          taskEngineMessages: result.messages,
        };
      }

      // Fallback for now
      return {
        taskEngineMessages: result.messages,
      };
    } catch (error) {
      logger.error("🚀 [TOOLS NODE] Error during tool execution", {
        operation: "toolsNode",
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        taskEngineMessagesLength: state.taskEngineMessages?.length,
        selectedCompanyId: state.selectedCompanyId,
      });
      return {};
    }
  };

  /**
   * The general idea is to use a Re-Act pattern to contionusly improve the response
   * In order to properly reason it can communciate in its own messageing system.
   */
  const subGraph = new StateGraph(workflowEngineState, configAnnotation);

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
    .addConditionalEdges("plan", planEdgeDecision, [
      "tools",
      "reflect",
      "abortOutput",
    ])
    .addConditionalEdges("reflect", reflectionEdggeDecision, ["plan", "output"])
    .addEdge("abortOutput", END)
    .addEdge("output", END);

  return subGraph.compile();
}
