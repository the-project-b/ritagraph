import {
  AIMessage,
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  Annotation,
  MessagesAnnotation,
} from "@langchain/langgraph";

/**
 * Base state annotation that includes message handling and authentication.
 */
const StateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  accessToken: Annotation<string | undefined>,
  systemMessages: Annotation<SystemMessage[]>,
});

/**
 * Extended state type that includes memory management for task state and other persistent data.
 */
export type ExtendedState = {
  accessToken?: string;
  systemMessages: AIMessage[];
  messages: (AIMessage | ToolMessage)[];
  memory?: Map<string, any>;
  // New LangGraph-aligned fields
  gatheredContext?: GatheredContext;
  contextHistory?: GatheredContext[];
  taskState?: TaskState;
};

// Context-related types for better state management
export interface GatheredContext {
  staticContext: Record<string, any>;
  dynamicContext: Record<string, any>;
  userContext: Record<string, any>;
  typeContext: {
    requiredParameters: string[];
    optionalParameters: string[];
    parameterTypes: Record<string, string>;
  };
  extractedPatterns: {
    companyIds: string[];
    contractIds: string[];
    employeeIds: string[];
    userIds: string[];
    statusFilters: string[];
    dateRanges: { startDate?: string; endDate?: string; type: string }[];
  };
  resolutionStrategies: Array<{
    parameter: string;
    sources: string[];
    confidence: number;
    fallback?: string;
    required: boolean;
    type?: string;
  }>;
  timestamp: string;
}

export interface TaskState {
  tasks: Array<any>;
  completedTasks: Set<string>;
  failedTasks: Set<string>;
  executionStartTime?: number;
}

/**
 * LangGraph-optimized state annotation with built-in reducers
 * This provides better alignment with LangGraph patterns while maintaining functionality
 */
const OptimizedStateAnnotation = Annotation.Root({
  ...StateAnnotation.spec,
  // Context management with built-in reducers
  gatheredContext: Annotation<GatheredContext | undefined>({
    reducer: (existing, updated) => {
      if (!updated) return existing;
      if (!existing) return updated;

      // Merge contexts intelligently
      return {
        ...existing,
        ...updated,
        staticContext: { ...existing.staticContext, ...updated.staticContext },
        dynamicContext: {
          ...existing.dynamicContext,
          ...updated.dynamicContext,
        },
        userContext: { ...existing.userContext, ...updated.userContext },
        typeContext: {
          requiredParameters: [
            ...new Set([
              ...existing.typeContext.requiredParameters,
              ...updated.typeContext.requiredParameters,
            ]),
          ],
          optionalParameters: [
            ...new Set([
              ...existing.typeContext.optionalParameters,
              ...updated.typeContext.optionalParameters,
            ]),
          ],
          parameterTypes: {
            ...existing.typeContext.parameterTypes,
            ...updated.typeContext.parameterTypes,
          },
        },
        timestamp: updated.timestamp || existing.timestamp,
      };
    },
    default: () => undefined,
  }),

  // Context history with automatic management
  contextHistory: Annotation<GatheredContext[]>({
    reducer: (existing = [], updated = []) => {
      const combined = [...existing, ...updated];
      // Automatically limit to last 10 contexts and deduplicate by timestamp
      const unique = combined.reduce((acc, context) => {
        const exists = acc.find((c) => c.timestamp === context.timestamp);
        if (!exists) acc.push(context);
        return acc;
      }, [] as GatheredContext[]);

      return unique.slice(-10);
    },
    default: () => [],
  }),

  // Task state management
  taskState: Annotation<TaskState | undefined>({
    reducer: (existing, updated) => {
      if (!updated) return existing;
      return updated;
    },
    default: () => undefined,
  }),

  // Backward compatibility with memory Map
  memory: Annotation<Map<string, any> | undefined>({
    reducer: (existing, updated) => {
      if (!updated) return existing;
      const newMemory = new Map(existing || new Map());
      for (const [key, value] of updated.entries()) {
        newMemory.set(key, value);
      }
      return newMemory;
    },
    default: () => new Map(),
  }),
});

/**
 * Merged state annotation that combines all state features.
 * Includes message handling, authentication, and memory management.
 *
 * @deprecated Use OptimizedStateAnnotation for better LangGraph alignment
 */
const MergedAnnotation = Annotation.Root({
  ...StateAnnotation.spec,
  memory: Annotation<Map<string, any> | undefined>,
});

export { MergedAnnotation, OptimizedStateAnnotation };
