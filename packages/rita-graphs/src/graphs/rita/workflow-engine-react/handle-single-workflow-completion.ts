import { Node } from "../graph-state.js";

const MAX_CONCURRENT_WORKFLOWS = 5;

/**
 * This node is used to handle the completion of a single workflow engine.
 * It will loop itself until all workflow engines have been completed.
 */
export const handleSingleWorkflowCompletion: Node = async ({
  todos,
  workflowEngineTaskHandles,
}) => {
  const handles = workflowEngineTaskHandles ?? [];

  // 1) If everything processed, signal completion
  if (handles.length === 0 || handles.every((h) => h.processed)) {
    return { allWorkflowEnginesCompleted: true };
  }

  // Partition handles
  const running = handles.filter(
    (h) => !h.processed && h.workflowPromise !== undefined,
  );
  const idle = handles.filter(
    (h) => !h.processed && h.workflowPromise === undefined,
  );

  // 2) Schedule new tasks up to capacity, if any capacity left
  const capacity = Math.max(MAX_CONCURRENT_WORKFLOWS - running.length, 0);
  if (capacity > 0 && idle.length > 0) {
    const toStart = idle.slice(0, capacity);
    const updated = handles.map((h) => {
      if (toStart.find((s) => s.id === h.id)) {
        const base = h.workflowFactory()();
        const wrapped = base
          .then(() => ({ id: h.id, ok: true as const }))
          .catch(() => ({ id: h.id, ok: false as const }));
        return { ...h, workflowPromise: wrapped };
      }
      return h;
    });
    return { workflowEngineTaskHandles: updated };
  }

  // 3) If there are running tasks, wait for the first one to settle, then mark processed
  if (running.length > 0) {
    const raced = await Promise.race(
      running.map(
        (h) => h.workflowPromise as Promise<{ id: string; ok: boolean }>,
      ),
    );
    const winnerId = raced.id;
    return {
      todos: todos.map((t) =>
        t.id === winnerId ? { ...t, status: "completed" } : t,
      ),
      workflowEngineTaskHandles: handles.map((h) =>
        h.id === winnerId
          ? { ...h, processed: true, workflowPromise: undefined }
          : h,
      ),
    };
  }

  // 4) If we got here: there are unprocessed tasks but none running (shouldn't happen), start one
  if (idle.length > 0) {
    const next = idle[0];
    const base = next.workflowFactory()();
    const wrapped = base
      .then(() => ({ id: next.id, ok: true as const }))
      .catch(() => ({ id: next.id, ok: false as const }));
    return {
      workflowEngineTaskHandles: handles.map((h) =>
        h.id === next.id ? { ...h, workflowPromise: wrapped } : h,
      ),
    };
  }

  return {};
};
