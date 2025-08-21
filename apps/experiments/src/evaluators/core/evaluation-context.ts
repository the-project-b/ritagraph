import { AsyncLocalStorage } from "node:async_hooks";
import { createLogger } from "@the-project-b/logging";
import type { Logger } from "@the-project-b/logging";

/**
 * Context data available during evaluation
 */
export interface EvaluationContext {
  exampleId?: string;
  experimentName?: string;
  evaluatorType?: string;
}

/**
 * AsyncLocalStorage instance for evaluation context
 * This allows us to access context data anywhere in the evaluation flow
 * without passing it through every function
 */
const evaluationContext = new AsyncLocalStorage<EvaluationContext>();

/**
 * Get the current evaluation context
 */
export function getEvaluationContext(): EvaluationContext | undefined {
  return evaluationContext.getStore();
}

/**
 * Run a function with evaluation context
 */
export function runWithEvaluationContext<T>(
  context: EvaluationContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return evaluationContext.run(context, fn);
}

/**
 * Update the current evaluation context
 */
export function updateEvaluationContext(
  updates: Partial<EvaluationContext>,
): void {
  const current = evaluationContext.getStore();
  if (current) {
    Object.assign(current, updates);
  }
}

/**
 * Create a logger that automatically includes evaluation context
 */
export function createEvaluationLogger(
  service: string,
  module: string,
): Logger {
  const baseLogger = createLogger({ service }).child({ module });

  // Wrap logger methods to include context
  const wrappedLogger = new Proxy(baseLogger, {
    get(target, prop) {
      const value = target[prop as keyof Logger];

      // Only wrap logging methods
      if (
        typeof value === "function" &&
        ["trace", "debug", "info", "warn", "error", "fatal"].includes(
          prop as string,
        )
      ) {
        return function (...args: any[]) {
          const context = getEvaluationContext();

          // If we have context, add it to the log data
          if (context && context.exampleId) {
            // Find the data object in args (usually the last object argument)
            const dataIndex = args.findIndex(
              (arg) =>
                typeof arg === "object" && arg !== null && !Array.isArray(arg),
            );

            if (dataIndex === -1) {
              // No data object, add one at the end
              args.push({
                exampleId: context.exampleId,
                experimentName: context.experimentName,
                evaluatorType: context.evaluatorType,
              });
            } else {
              // Merge context into existing data object
              args[dataIndex] = {
                ...args[dataIndex],
                exampleId: context.exampleId,
                experimentName: context.experimentName,
                evaluatorType: context.evaluatorType,
              };
            }
          }

          return value.apply(target, args);
        };
      }

      return value;
    },
  });

  return wrappedLogger as Logger;
}
