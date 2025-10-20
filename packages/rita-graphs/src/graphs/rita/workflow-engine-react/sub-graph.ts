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
import { isAIMessage } from "@langchain/core/messages";
import { createLogger } from "@the-project-b/logging";

import { plan, planEdgeDecision } from "./nodes/plan.js";
import { output } from "./nodes/output.js";
import { emptyNode } from "../../../utility-nodes/empty-node.js";
import { NodeWithAuth, ToolInterface } from "../../shared-types/node-types.js";
import {
  AnnotationWithDefault,
  BaseGraphAnnotation,
} from "../../shared-types/base-annotation.js";
import { abortOutput } from "./nodes/abort-output.js";

import AgentActionLogger from "../../../utils/agent-action-logger/AgentActionLogger.js";
import { extractRequest } from "./nodes/extract-request.js";

export const workflowEngineState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  taskEngineMessages: MessagesAnnotation.spec.messages,
  decision: Annotation<"ACCEPT" | "IMPROVE" | undefined>(),
  reflectionStepCount: AnnotationWithDefault<number>(0),
  taskEngineLoopCounter: AnnotationWithDefault<number>(0),
  workflowEngineResponseDraft: Annotation<string | undefined>(),
  sanitizedUserRequest: Annotation<string | undefined>(),
  /**
   * Used to identify the workflow in case of async workflows.
   */
  workflowId: Annotation<string | undefined>(),
  /**
   * Assgined todo id in case of async workflows.
   * This way we can track of which todos have been done
   */
  assignedTodoId: Annotation<string | undefined>(),
});

export type WorkflowEngineStateType = typeof workflowEngineState.State;

export type WorkflowEngineNode = NodeWithAuth<WorkflowEngineStateType, any>;

export type BuildWorkflowEngineReActParams = {
  fetchTools: (
    companyId: string,
    config: AnnotationRoot<any>,
    agentActionLogger: AgentActionLogger,
    rolesRitaShouldBeVisibleTo: Array<number> | null,
  ) => Promise<Array<ToolInterface>>;
  preWorkflowResponse?: WorkflowEngineNode;
  quickUpdateNode?: WorkflowEngineNode;
  configAnnotation: AnnotationRoot<any>;
  getAuthUser: (config: any) => any;
};

export function buildWorkflowEngineReAct({
  fetchTools,
  preWorkflowResponse,
  configAnnotation,
  quickUpdateNode,
  getAuthUser,
}: BuildWorkflowEngineReActParams) {
  const logger = createLogger({ service: "rita-graphs" }).child({
    module: "WorkflowEngine",
    component: "SubGraph",
  });

  const wrapNodeWithAuth = (node: WorkflowEngineNode) => {
    return async (state, config) => {
      return node(state, config, getAuthUser);
    };
  };

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

      const tools = await fetchTools(
        state.selectedCompanyId,
        config,
        state.agentActionLogger,
        state.rolesRitaShouldBeVisibleTo,
      );

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
        const toolCalls = result
          .filter((i) => !isCommand(i))
          .map((i) => i.messages)
          .flat();
        const updates = [];
        commands.forEach((item) => {
          updates.push(item.update);
        });

        return {
          taskEngineMessages: [
            ...updates.map((update) => update.messages).flat(),
            ...toolCalls,
          ],
          dataRepresentationLayerStorage: updates.reduce(
            (acc, update) => ({
              ...acc,
              ...update.dataRepresentationLayerStorage,
            }),
            state.dataRepresentationLayerStorage ?? {},
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
        threadId: config?.configurable?.thread_id || "unknown",
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
    .addNode(
      "preWorkflowResponse",
      wrapNodeWithAuth(preWorkflowResponse ?? emptyNode),
    )
    .addNode("extractRequest", wrapNodeWithAuth(extractRequest))
    .addNode("plan", wrapNodeWithAuth(plan(fetchTools)))
    .addNode("output", wrapNodeWithAuth(output))
    .addNode("abortOutput", wrapNodeWithAuth(abortOutput))
    .addNode("tools", wrapNodeWithAuth(toolsNode))
    .addNode("quickUpdate", wrapNodeWithAuth(quickUpdateNode ?? emptyNode))
    .addEdge(START, "preWorkflowResponse")
    .addEdge("preWorkflowResponse", "extractRequest")
    .addEdge("extractRequest", "plan")
    .addEdge("tools", "plan")
    .addEdge("plan", "quickUpdate")
    .addConditionalEdges("plan", planEdgeDecision, [
      "tools",
      "output",
      "abortOutput",
    ])
    .addEdge("abortOutput", END)
    .addEdge("output", END);

  return subGraph.compile();
}
