import { randomUUID } from "crypto";

import { Node } from "../graph-state.js";

import {
  buildWorkflowEngineReAct,
  BuildWorkflowEngineReActParams,
} from "./sub-graph.js";
import { AgentTodoItem } from "../nodes/todo-engine/todo-engine.js";

type Factory = (params: BuildWorkflowEngineReActParams) => Node;

/**
 * This node is used to run multiple workflow engines in parallel.
 * It does that by wrapping the sub-graph.ts node into a function and aggregating the results.
 *
 * It creates a stream of workflow engines and subscribes to it. It will hand this stream object
 * over to node that will loop until all workflow engines have been completed.
 */
export const buildAsyncWorkflowEngineReAct: Factory =
  (params) => async (state, config) => {
    const { todos } = state;

    async function runWorkflowEngine(todo: AgentTodoItem) {
      const workflowId = randomUUID();
      const workflowEngine = buildWorkflowEngineReAct(params);

      const newState = {
        ...state,
        messages: state.messages.slice(0, -1), // remove the last message
        todos: [todo],
        workflowId,
        assignedTodoId: todo.id,
      };

      return await workflowEngine.invoke(newState, {
        runName: `workflow-engine-${workflowId}`,
        runId: config.runId,
        configurable: config.configurable,
      });
    }

    return {
      workflowEngineTaskHandles: todos.map((todo) => ({
        workflowFactory: () => () => runWorkflowEngine(todo),
        id: todo.id,
        processed: false,
      })),
    };
  };
