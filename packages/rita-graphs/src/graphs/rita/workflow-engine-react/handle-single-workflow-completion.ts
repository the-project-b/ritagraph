import { firstValueFrom, Observable } from "rxjs";

import { WorkflowEngineStateType } from "./sub-graph.js";
import { Node } from "../graph-state.js";

/**
 * This node is used to handle the completion of a single workflow engine.
 * It will loop itself until all workflow engines have been completed.
 */
export const handleSingleWorkflowCompletion: Node = async ({
  asyncWorkflowEngineMessages,
  todos,
  workflowEngineStream,
  worklowEngineStreamSubscription,
}) => {
  const NONE = Symbol("NONE");

  const nextWorkflowEngineResult = await firstValueFrom(
    workflowEngineStream as Observable<WorkflowEngineStateType>,
    {
      defaultValue: NONE,
    },
  );

  if (nextWorkflowEngineResult !== NONE) {
    const result = nextWorkflowEngineResult as WorkflowEngineStateType;

    // Aggregate the workflow results
    const newAsyncWorkflowEngineMessages = {
      ...asyncWorkflowEngineMessages,
      [result.workflowId]: [
        ...(asyncWorkflowEngineMessages?.[result.workflowId] ?? []),
        ...result.messages,
      ],
    };

    return {
      asyncWorkflowEngineMessages: newAsyncWorkflowEngineMessages,
      // mark associated todo as completed
      todos: todos.map((todo) =>
        result.assignedTodoId === todo.id
          ? { ...todo, status: "completed" }
          : todo,
      ),
      allWorkflowEnginesCompleted: false,
    };
  }
  worklowEngineStreamSubscription?.unsubscribe();
  return {
    allWorkflowEnginesCompleted: true,
  };
};
