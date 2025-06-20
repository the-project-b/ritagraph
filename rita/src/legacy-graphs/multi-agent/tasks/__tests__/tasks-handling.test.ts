import { describe, it, expect, beforeEach } from "@jest/globals";
import { ExtendedState } from "../../../../states/states";
import { Task, TaskState } from "../../types";

// Mock GraphQL client to prevent environment variable requirement
jest.mock("../../../../utils/graphql-client.ts", () => ({
  ProjectBGraphQLClient: jest.fn().mockImplementation(() => ({
    request: jest.fn(),
    setEndpoint: jest.fn(),
    setHeaders: jest.fn(),
  })),
  graphqlClient: {
    request: jest.fn(),
    setEndpoint: jest.fn(),
    setHeaders: jest.fn(),
  },
}));

// Mock user service
jest.mock("../../../../utils/user-service.ts", () => ({
  userService: {
    getUserName: jest.fn(() => Promise.resolve("Test User")),
    getCompanyName: jest.fn(() => Promise.resolve("Test Company")),
    getCompanyId: jest.fn(() => Promise.resolve("test-company-456")),
    getUserEmail: jest.fn(() => Promise.resolve("test@example.com")),
    getUserRole: jest.fn(() => Promise.resolve("ADMIN")),
    getUserLanguage: jest.fn(() => Promise.resolve("en")),
  },
}));

// Mock placeholder manager
jest.mock("../../../../placeholders/manager", () => ({
  placeholderManager: {
    buildInvokeObject: jest.fn(() =>
      Promise.resolve({
        userId: "test-user-123",
        auto_companyid: "test-company-456",
      })
    ),
    register: jest.fn(),
    resolve: jest.fn(() => Promise.resolve("resolved-value")),
    getRegisteredPlaceholders: jest.fn(() => ["test-placeholder"]),
  },
}));

import {
  updateTaskResult,
  getNextTask,
  extendTaskStateWithNewTasks,
  getCompletedTasksContext,
  updateTaskProgress,
  getTaskProgress,
  hasPendingTasks,
  clearCompletedTaskHistory,
} from "../tasks-handling";

describe("TasksHandling - Core Fixes", () => {
  let mockState: ExtendedState;

  beforeEach(() => {
    mockState = {
      messages: [],
      systemMessages: [],
      memory: new Map<string, any>(),
    };
  });

  describe("Task Numbering Continuation", () => {
    it("should continue task numbering from existing tasks in memory", () => {
      // Scenario: User had previous conversation with task_0, task_1 completed
      // Now submitting new request - should start with task_2
      const stateWithPreviousTasks: ExtendedState = {
        ...mockState,
        memory: new Map<string, any>([
          [
            "taskState",
            {
              tasks: [
                {
                  id: "task_0",
                  status: "completed",
                  result: { data: "user info" },
                  description: "get user info",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "completion",
                    context: {},
                  },
                },
                {
                  id: "task_1",
                  status: "completed",
                  result: { data: "role info" },
                  description: "get role info",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "completion",
                    context: {},
                  },
                },
              ],
              completedTasks: new Set(["task_0", "task_1"]),
              failedTasks: new Set(),
              executionStartTime: Date.now() - 1000,
            },
          ],
          ["userContext", { name: "John" }],
        ]),
      };

      const newTasks: Task[] = [
        {
          id: "task_0", // Will be renumbered to task_2
          description: "get new data",
          type: "query",
          targetAgent: "query_agent",
          dependencies: [],
          status: "pending",
          sources: [],
          citations: [],
          confidence: 0.5,
          verificationStatus: "unverified",
          context: {
            dataRequirements: [],
            phase: "initialization",
            context: {},
          },
        },
        {
          id: "task_1", // Will be renumbered to task_3
          description: "update based on new data",
          type: "mutation",
          targetAgent: "mutation_agent",
          dependencies: ["task_0"], // Will be updated to task_2
          status: "pending",
          sources: [],
          citations: [],
          confidence: 0.5,
          verificationStatus: "unverified",
          context: {
            dataRequirements: [],
            phase: "initialization",
            context: {},
          },
        },
      ];

      const result = extendTaskStateWithNewTasks(stateWithPreviousTasks, {
        newTasks,
        executionStartTime: Date.now(),
      });

      const taskState = result.memory?.get("taskState") as TaskState;

      // CRITICAL ASSERTIONS: Task numbering should continue from highest existing
      expect(taskState.tasks).toHaveLength(4); // 2 existing + 2 new
      expect(taskState.tasks[2].id).toBe("task_2"); // New task starts at task_2
      expect(taskState.tasks[3].id).toBe("task_3"); // Second new task is task_3
      expect(taskState.tasks[3].dependencies).toEqual(["task_2"]); // Dependencies updated

      // Previous tasks and context should be preserved
      expect(taskState.completedTasks.has("task_0")).toBe(true);
      expect(taskState.completedTasks.has("task_1")).toBe(true);
      expect(taskState.tasks[0].result).toEqual({ data: "user info" });
      expect(result.memory?.get("userContext")).toEqual({ name: "John" });
    });

    it("should detect task references in memory when no taskState exists", () => {
      // Scenario: No taskState but memory contains references to task_3
      // New tasks should start from task_4
      const stateWithTaskReferences: ExtendedState = {
        ...mockState,
        memory: new Map<string, any>([
          ["lastResult", "Based on task_3 result, user is admin"],
          [
            "queryContext",
            JSON.stringify({ relatedTo: "task_2", dependsOn: "task_1" }),
          ],
          ["userInfo", JSON.stringify({ discoveredBy: "task_0" })],
        ]),
      };

      const newTasks: Task[] = [
        {
          id: "task_0", // Will be renumbered to task_4
          description: "new query",
          type: "query",
          targetAgent: "query_agent",
          dependencies: [],
          status: "pending",
          sources: [],
          citations: [],
          confidence: 0.5,
          verificationStatus: "unverified",
          context: {
            dataRequirements: [],
            phase: "initialization",
            context: {},
          },
        },
      ];

      const result = extendTaskStateWithNewTasks(stateWithTaskReferences, {
        newTasks,
        executionStartTime: Date.now(),
      });

      const taskState = result.memory?.get("taskState") as TaskState;

      // ASSERTION: Should start from task_4 (highest found was task_3)
      expect(taskState.tasks[0].id).toBe("task_4");

      // Original memory should be preserved
      expect(result.memory?.get("lastResult")).toBe(
        "Based on task_3 result, user is admin"
      );
    });
  });

  describe("updateTaskResult - Critical Bug Fix", () => {
    it("should NOT reset other in_progress tasks when one task completes", () => {
      // This was the critical bug: updateTaskResult was resetting ALL in_progress tasks
      const taskStateWithMultipleTasks: TaskState = {
        tasks: [
          {
            id: "task_0",
            status: "in_progress", // This should NOT be reset
            description: "ongoing task",
            type: "query",
            targetAgent: "query_agent",
            dependencies: [],
            sources: [],
            citations: [],
            confidence: 0.5,
            verificationStatus: "unverified",
            context: { dataRequirements: [], phase: "execution", context: {} },
          },
          {
            id: "task_1",
            status: "in_progress", // This is completing
            description: "completing task",
            type: "mutation",
            targetAgent: "mutation_agent",
            dependencies: [],
            sources: [],
            citations: [],
            confidence: 0.5,
            verificationStatus: "unverified",
            context: { dataRequirements: [], phase: "execution", context: {} },
          },
          {
            id: "task_2",
            status: "pending", // This should remain pending
            description: "waiting task",
            type: "query",
            targetAgent: "query_agent",
            dependencies: ["task_1"],
            sources: [],
            citations: [],
            confidence: 0.5,
            verificationStatus: "unverified",
            context: {
              dataRequirements: [],
              phase: "initialization",
              context: {},
            },
          },
        ],
        completedTasks: new Set<string>(),
        failedTasks: new Set<string>(),
        executionStartTime: Date.now(),
      };

      // Complete task_1
      const result = updateTaskResult(taskStateWithMultipleTasks, "task_1", {
        data: "mutation completed",
      });

      // CRITICAL ASSERTIONS: Other tasks should keep their statuses
      expect(result.tasks[0].status).toBe("in_progress"); // task_0 still in_progress
      expect(result.tasks[1].status).toBe("completed"); // task_1 completed
      expect(result.tasks[2].status).toBe("pending"); // task_2 still pending

      // Sets should be updated correctly
      expect(result.completedTasks.has("task_1")).toBe(true);
      expect(result.completedTasks.has("task_0")).toBe(false);
      expect(result.tasks[1].result).toEqual({ data: "mutation completed" });
    });
  });

  describe("getNextTask - Task Selection Logic", () => {
    it("should select task with all dependencies completed using actual task status", () => {
      const stateWithDependencies: ExtendedState = {
        ...mockState,
        memory: new Map<string, any>([
          [
            "taskState",
            {
              tasks: [
                {
                  id: "task_0",
                  status: "completed", // Dependency satisfied
                  description: "completed task",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "completion",
                    context: {},
                  },
                },
                {
                  id: "task_1",
                  status: "pending",
                  description: "ready task",
                  dependencies: ["task_0"], // Dependency satisfied
                  type: "mutation",
                  targetAgent: "mutation_agent",
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "initialization",
                    context: {},
                  },
                },
                {
                  id: "task_2",
                  status: "pending",
                  description: "waiting task",
                  dependencies: ["task_1"], // Dependency NOT satisfied
                  type: "query",
                  targetAgent: "query_agent",
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "initialization",
                    context: {},
                  },
                },
              ],
              completedTasks: new Set(["task_0"]),
              failedTasks: new Set(),
              executionStartTime: Date.now(),
            },
          ],
        ]),
      };

      const { task, updatedState } = getNextTask(stateWithDependencies);

      // CRITICAL ASSERTIONS: Should select task_1 (dependencies satisfied)
      expect(task?.id).toBe("task_1");
      expect(task?.status).toBe("pending"); // Original status before selection

      // Task should be marked as in_progress in updated state
      const updatedTaskState = updatedState.memory?.get(
        "taskState"
      ) as TaskState;
      const selectedTask = updatedTaskState.tasks.find(
        (t) => t.id === "task_1"
      );
      expect(selectedTask?.status).toBe("in_progress");
    });

    it("should use actual task status for dependency checking (not Set-based)", () => {
      // This tests the fix for Set vs status inconsistencies
      const stateWithInconsistentSets: ExtendedState = {
        ...mockState,
        memory: new Map<string, any>([
          [
            "taskState",
            {
              tasks: [
                {
                  id: "task_0",
                  status: "completed", // Actual status is completed
                  description: "completed task",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "completion",
                    context: {},
                  },
                },
                {
                  id: "task_1",
                  status: "pending",
                  description: "should be available",
                  dependencies: ["task_0"], // Should be available since task_0 status is completed
                  type: "mutation",
                  targetAgent: "mutation_agent",
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "initialization",
                    context: {},
                  },
                },
              ],
              completedTasks: new Set(), // Set is empty (inconsistent)
              failedTasks: new Set(),
              executionStartTime: Date.now(),
            },
          ],
        ]),
      };

      const { task } = getNextTask(stateWithInconsistentSets);

      // ASSERTION: Should select task_1 based on actual task status, not Set
      expect(task?.id).toBe("task_1");
    });
  });

  describe("Context Preservation", () => {
    it("should preserve completed task context for future reference", () => {
      const stateWithCompletedTasks: ExtendedState = {
        ...mockState,
        memory: new Map<string, any>([
          [
            "taskState",
            {
              tasks: [
                {
                  id: "task_0",
                  status: "completed",
                  result: { data: "John Doe", role: "admin" },
                  description: "get user info",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.8,
                  verificationStatus: "verified",
                  context: {
                    dataRequirements: [],
                    phase: "completion",
                    context: {},
                  },
                },
                {
                  id: "task_1",
                  status: "completed",
                  result: { permissions: ["read", "write", "admin"] },
                  description: "who am I",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: ["task_0"],
                  sources: [],
                  citations: [],
                  confidence: 0.9,
                  verificationStatus: "verified",
                  context: {
                    dataRequirements: [],
                    phase: "completion",
                    context: {},
                  },
                },
              ],
              completedTasks: new Set(["task_0", "task_1"]),
              failedTasks: new Set(),
              executionStartTime: Date.now() - 5000,
            },
          ],
        ]),
      };

      const context = getCompletedTasksContext(stateWithCompletedTasks);

      // ASSERTIONS: Should extract useful context from completed tasks
      expect(context.completedTasks).toHaveLength(2);
      expect(context.recentResults).toHaveLength(2);
      expect(context.recentResults[0]).toEqual({
        data: "John Doe",
        role: "admin",
      });
      expect(context.recentResults[1]).toEqual({
        permissions: ["read", "write", "admin"],
      });

      // Should identify user info from task descriptions
      // The function finds the first task with "user" and "info" in description, which is task_0
      expect(context.userInfo).toEqual({ data: "John Doe", role: "admin" });

      // Should build available data context
      // Only tasks with result.data are added to availableData (task_0 has data property)
      expect(Object.keys(context.availableData)).toHaveLength(1);
      expect(context.availableData["get_user_info"]).toEqual("John Doe");
    });

    it("should allow clearing completed task history while preserving active tasks", () => {
      const stateWithMixedTasks: ExtendedState = {
        ...mockState,
        memory: new Map<string, any>([
          [
            "taskState",
            {
              tasks: [
                {
                  id: "task_0",
                  status: "completed",
                  result: { old: "data" },
                  description: "old task",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "completion",
                    context: {},
                  },
                },
                {
                  id: "task_1",
                  status: "failed",
                  error: "network error",
                  description: "failed task",
                  type: "mutation",
                  targetAgent: "mutation_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "execution",
                    context: {},
                  },
                },
                {
                  id: "task_2",
                  status: "in_progress",
                  description: "current work",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "execution",
                    context: {},
                  },
                },
                {
                  id: "task_3",
                  status: "pending",
                  description: "future work",
                  type: "mutation",
                  targetAgent: "mutation_agent",
                  dependencies: ["task_2"],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "initialization",
                    context: {},
                  },
                },
              ],
              completedTasks: new Set(["task_0"]),
              failedTasks: new Set(["task_1"]),
              executionStartTime: Date.now(),
            },
          ],
        ]),
      };

      const result = clearCompletedTaskHistory(stateWithMixedTasks);
      const taskState = result.memory?.get("taskState") as TaskState;

      // ASSERTIONS: Should keep only active tasks
      expect(taskState.tasks).toHaveLength(2);
      expect(taskState.tasks[0].id).toBe("task_2"); // in_progress kept
      expect(taskState.tasks[1].id).toBe("task_3"); // pending kept
      expect(taskState.completedTasks.size).toBe(0);
      expect(taskState.failedTasks.size).toBe(0);
    });
  });

  describe("Task Progress and State Management", () => {
    it("should accurately calculate task progress using Set sizes", () => {
      const taskState: TaskState = {
        tasks: [
          {
            id: "task_0",
            status: "completed",
            description: "completed task",
            type: "query",
            targetAgent: "query_agent",
            dependencies: [],
            sources: [],
            citations: [],
            confidence: 0.5,
            verificationStatus: "unverified",
            context: { dataRequirements: [], phase: "completion", context: {} },
          },
          {
            id: "task_1",
            status: "completed",
            description: "another completed task",
            type: "mutation",
            targetAgent: "mutation_agent",
            dependencies: [],
            sources: [],
            citations: [],
            confidence: 0.5,
            verificationStatus: "unverified",
            context: { dataRequirements: [], phase: "completion", context: {} },
          },
          {
            id: "task_2",
            status: "failed",
            description: "failed task",
            type: "query",
            targetAgent: "query_agent",
            dependencies: [],
            sources: [],
            citations: [],
            confidence: 0.5,
            verificationStatus: "unverified",
            context: { dataRequirements: [], phase: "execution", context: {} },
          },
          {
            id: "task_3",
            status: "in_progress",
            description: "running task",
            type: "mutation",
            targetAgent: "mutation_agent",
            dependencies: [],
            sources: [],
            citations: [],
            confidence: 0.5,
            verificationStatus: "unverified",
            context: { dataRequirements: [], phase: "execution", context: {} },
          },
          {
            id: "task_4",
            status: "pending",
            description: "waiting task",
            type: "query",
            targetAgent: "query_agent",
            dependencies: ["task_3"],
            sources: [],
            citations: [],
            confidence: 0.5,
            verificationStatus: "unverified",
            context: {
              dataRequirements: [],
              phase: "initialization",
              context: {},
            },
          },
        ],
        completedTasks: new Set(["task_0", "task_1"]),
        failedTasks: new Set(["task_2"]),
        executionStartTime: Date.now(),
      };

      const progress = getTaskProgress(taskState);

      // ASSERTIONS: Should count by Set sizes (current implementation)
      expect(progress.total).toBe(5);
      expect(progress.completed).toBe(2); // From Set
      expect(progress.failed).toBe(1); // From Set
      expect(progress.pending).toBe(2); // total - completed - failed - dataGathering
    });

    it("should detect pending tasks correctly", () => {
      const stateWithPendingTasks: ExtendedState = {
        ...mockState,
        memory: new Map<string, any>([
          [
            "taskState",
            {
              tasks: [
                {
                  id: "task_0",
                  status: "completed",
                  description: "done",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "completion",
                    context: {},
                  },
                },
                {
                  id: "task_1",
                  status: "pending",
                  description: "waiting",
                  type: "mutation",
                  targetAgent: "mutation_agent",
                  dependencies: ["task_0"],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "initialization",
                    context: {},
                  },
                },
              ],
              completedTasks: new Set(["task_0"]),
              failedTasks: new Set(),
              executionStartTime: Date.now(),
            },
          ],
        ]),
      };

      const hasPending = hasPendingTasks(stateWithPendingTasks);
      expect(hasPending).toBe(true);
    });

    it("should handle task progress updates correctly", () => {
      const stateWithTask: ExtendedState = {
        ...mockState,
        memory: new Map<string, any>([
          [
            "taskState",
            {
              tasks: [
                {
                  id: "task_0",
                  status: "in_progress",
                  description: "running task",
                  type: "query",
                  targetAgent: "query_agent",
                  dependencies: [],
                  sources: [],
                  citations: [],
                  confidence: 0.5,
                  verificationStatus: "unverified",
                  context: {
                    dataRequirements: [],
                    phase: "execution",
                    context: {},
                  },
                },
              ],
              completedTasks: new Set(),
              failedTasks: new Set(),
              executionStartTime: Date.now(),
            },
          ],
        ]),
      };

      // Test successful completion
      const successResult = updateTaskProgress(stateWithTask, {
        taskId: "task_0",
        result: { data: "success" },
      });

      const successTaskState = successResult.memory?.get(
        "taskState"
      ) as TaskState;
      expect(successTaskState.tasks[0].status).toBe("completed");
      expect(successTaskState.tasks[0].result).toEqual({ data: "success" });
      expect(successTaskState.completedTasks.has("task_0")).toBe(true);

      // Test failure
      const failureResult = updateTaskProgress(stateWithTask, {
        taskId: "task_0",
        error: "Something went wrong",
      });

      const failureTaskState = failureResult.memory?.get(
        "taskState"
      ) as TaskState;
      expect(failureTaskState.tasks[0].status).toBe("failed");
      expect(failureTaskState.tasks[0].error).toBe("Something went wrong");
      expect(failureTaskState.failedTasks.has("task_0")).toBe(true);
    });
  });
});
