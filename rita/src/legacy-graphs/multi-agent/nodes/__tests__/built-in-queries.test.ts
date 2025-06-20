// Built-in Queries Tool Tests
import {
  BuiltInQueryManager,
  builtInQueryManager,
  IntentMatch,
  BuiltInQueryHandler,
} from "../built-in-queries.tool";
import { ExtendedState } from "../../../../states/states";
import { TaskState } from "../../types";
import { Command } from "@langchain/langgraph";

// Mock dependencies
jest.mock("../../../../placeholders/manager", () => ({
  placeholderManager: {
    buildInvokeObject: jest.fn(() =>
      Promise.resolve({
        userId: "test-user-123",
        auto_companyid: "test-company-456",
      })
    ),
  },
}));

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

jest.mock("../../agents/supervisor-agent", () => ({
  logEvent: jest.fn(),
}));

describe("BuiltInQueryManager", () => {
  let manager: BuiltInQueryManager;
  let mockState: ExtendedState;
  let mockConfig: any;

  beforeEach(() => {
    manager = new BuiltInQueryManager();

    mockState = {
      messages: [],
      systemMessages: [],
      memory: new Map([
        [
          "taskState",
          {
            tasks: [
              {
                id: "task_0",
                status: "in_progress",
                type: "query",
                description: "test task",
                queryDetails: {
                  selectedQueryName: "me",
                  selectionReason: "test",
                },
                dependencies: [],
                targetAgent: "query_agent",
                sources: [],
                citations: [],
                confidence: 0.8,
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
          } as TaskState,
        ],
      ]),
    };

    mockConfig = {
      user: {
        token: "test-token",
      },
    };

    // Clear all mocks and reset the placeholderManager mock to ensure it returns the expected data
    jest.clearAllMocks();

    // Reset userService mocks after clearing
    const { userService } = require("../../../../utils/user-service.ts");
    userService.getUserName.mockResolvedValue("Test User");
    userService.getCompanyName.mockResolvedValue("Test Company");
    userService.getCompanyId.mockResolvedValue("test-company-456");
    userService.getUserEmail.mockResolvedValue("test@example.com");
    userService.getUserRole.mockResolvedValue("ADMIN");
    userService.getUserLanguage.mockResolvedValue("en");

    // Ensure placeholderManager mock returns the expected structure
    const { placeholderManager } = require("../../../../placeholders/manager");
    placeholderManager.buildInvokeObject.mockResolvedValue({
      userId: "test-user-123",
      auto_companyid: "test-company-456",
      auto_username: "Test User",
      auto_companyname: "Test Company",
    });
  });

  describe("constructor", () => {
    it("should register default handlers", () => {
      const registeredQueries = manager.getRegisteredQueries();

      expect(registeredQueries).toContain("me");
      expect(registeredQueries).toContain("version");
      expect(registeredQueries).toContain("health");
      expect(registeredQueries).toHaveLength(3);
    });
  });

  describe("registerHandler", () => {
    it("should register a new handler", () => {
      const handler: BuiltInQueryHandler = {
        name: "test",
        description: "Test handler",
        handler: jest.fn(),
      };

      manager.registerHandler(handler);

      expect(manager.hasHandler("test")).toBe(true);
      expect(manager.getRegisteredQueries()).toContain("test");
    });
  });

  describe("hasHandler", () => {
    it("should return true for registered handlers", () => {
      expect(manager.hasHandler("me")).toBe(true);
      expect(manager.hasHandler("version")).toBe(true);
      expect(manager.hasHandler("health")).toBe(true);
    });

    it("should return false for non-registered handlers", () => {
      expect(manager.hasHandler("nonexistent")).toBe(false);
    });
  });

  describe("executeHandler", () => {
    it("should execute existing handler successfully", async () => {
      const result = await manager.executeHandler(
        "me",
        mockState,
        mockConfig,
        "who am i"
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["RESULT_FORMATTING"]);
    });

    it("should return null for non-existent handler", async () => {
      const result = await manager.executeHandler(
        "nonexistent",
        mockState,
        mockConfig,
        "test"
      );

      expect(result).toBeNull();
    });

    it("should handle handler errors gracefully", async () => {
      const failingHandler: BuiltInQueryHandler = {
        name: "failing",
        description: "Failing handler",
        handler: jest.fn(() => Promise.reject(new Error("Handler failed"))),
      };

      manager.registerHandler(failingHandler);

      await expect(
        manager.executeHandler("failing", mockState, mockConfig, "test")
      ).rejects.toThrow("Built-in query 'failing' failed: Handler failed");
    });
  });

  describe("handleBuiltInQuery", () => {
    it("should handle built-in query when handler exists", async () => {
      const selectedQuery: IntentMatch = {
        name: "me",
        arguments: {},
        reason: "User identity request",
      };

      const result = await manager.handleBuiltInQuery(
        mockState,
        mockConfig,
        "who am i",
        selectedQuery
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["RESULT_FORMATTING"]);
    });

    it("should return null when no handler exists", async () => {
      const selectedQuery: IntentMatch = {
        name: "nonexistent",
        arguments: {},
        reason: "Test",
      };

      const result = await manager.handleBuiltInQuery(
        mockState,
        mockConfig,
        "test",
        selectedQuery
      );

      expect(result).toBeNull();
    });
  });

  describe("me query handler", () => {
    it("should handle me query with valid task state", async () => {
      const result = await manager.executeHandler(
        "me",
        mockState,
        mockConfig,
        "who am i"
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["RESULT_FORMATTING"]);

      // Verify the result structure
      const updatedState = result?.update as any;
      const taskState = updatedState.memory.get("taskState") as TaskState;
      const task = taskState.tasks[0];

      expect(task.queryDetails.queryResult).toBeDefined();
      expect(task.queryDetails.queryResult.success).toBe(true);
      expect(task.queryDetails.queryResult.data.me).toBeDefined();
      expect(task.queryDetails.queryResult.data.me.id).toBe("test-user-123");
      expect(task.queryDetails.queryResult.data.me.email).toBe(
        "test@example.com"
      );
    });

    it("should handle me query without task state", async () => {
      const stateWithoutTask = {
        ...mockState,
        memory: new Map(),
      };

      const result = await manager.executeHandler(
        "me",
        stateWithoutTask,
        mockConfig,
        "who am i"
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["supervisor_agent"]);
    });
  });

  describe("version query handler", () => {
    it("should handle version query successfully", async () => {
      const result = await manager.executeHandler(
        "version",
        mockState,
        mockConfig,
        "what version"
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["RESULT_FORMATTING"]);

      // Verify the result structure
      const updatedState = result?.update as any;
      const taskState = updatedState.memory.get("taskState") as TaskState;
      const task = taskState.tasks[0];

      expect(task.queryDetails.queryResult).toBeDefined();
      expect(task.queryDetails.queryResult.success).toBe(true);
      expect(task.queryDetails.queryResult.data.version).toBeDefined();
      expect(task.queryDetails.queryResult.data.version.api).toBe("2.0.0");
      expect(task.queryDetails.queryResult.data.version.build).toBe(
        "rita-multi-agent-v2.0.0"
      );
    });
  });

  describe("health query handler", () => {
    it("should handle health query successfully", async () => {
      const result = await manager.executeHandler(
        "health",
        mockState,
        mockConfig,
        "system health"
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["RESULT_FORMATTING"]);

      // Verify the result structure
      const updatedState = result?.update as any;
      const taskState = updatedState.memory.get("taskState") as TaskState;
      const task = taskState.tasks[0];

      expect(task.queryDetails.queryResult).toBeDefined();
      expect(task.queryDetails.queryResult.success).toBe(true);
      expect(task.queryDetails.queryResult.data.health).toBeDefined();
      expect(task.queryDetails.queryResult.data.health.status).toBe("healthy");
      expect(task.queryDetails.queryResult.data.health.services).toBeDefined();
    });
  });

  describe("singleton instance", () => {
    it("should export a singleton instance", () => {
      expect(builtInQueryManager).toBeInstanceOf(BuiltInQueryManager);
      expect(builtInQueryManager.hasHandler("me")).toBe(true);
    });
  });

  describe("integration tests", () => {
    it("should handle complete flow for me query", async () => {
      const selectedQuery: IntentMatch = {
        name: "me",
        arguments: {},
        reason: "User identity request",
      };

      const result = await builtInQueryManager.handleBuiltInQuery(
        mockState,
        mockConfig,
        "who am i",
        selectedQuery
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["RESULT_FORMATTING"]);

      // Verify that placeholders and user service were called
      const {
        placeholderManager,
      } = require("../../../../placeholders/manager");
      const { userService } = require("../../../../utils/user-service.ts");

      expect(placeholderManager.buildInvokeObject).toHaveBeenCalledWith("", {
        state: mockState,
        config: mockConfig,
      });
      expect(userService.getUserName).toHaveBeenCalled();
      expect(userService.getCompanyName).toHaveBeenCalled();
      expect(userService.getCompanyId).toHaveBeenCalled();
      expect(userService.getUserEmail).toHaveBeenCalled();
      expect(userService.getUserRole).toHaveBeenCalled();
      expect(userService.getUserLanguage).toHaveBeenCalled();
    });

    it("should handle flow when query is not built-in", async () => {
      const selectedQuery: IntentMatch = {
        name: "employees",
        arguments: {},
        reason: "Employee list request",
      };

      const result = await builtInQueryManager.handleBuiltInQuery(
        mockState,
        mockConfig,
        "show employees",
        selectedQuery
      );

      expect(result).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should handle missing task state gracefully", async () => {
      const stateWithoutTasks = {
        ...mockState,
        memory: new Map([
          [
            "taskState",
            {
              tasks: [],
              completedTasks: new Set(),
              failedTasks: new Set(),
              executionStartTime: Date.now(),
            } as TaskState,
          ],
        ]),
      };

      const result = await manager.executeHandler(
        "me",
        stateWithoutTasks,
        mockConfig,
        "who am i"
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["supervisor_agent"]);
    });

    it("should handle placeholder manager errors", async () => {
      const {
        placeholderManager,
      } = require("../../../../placeholders/manager");
      placeholderManager.buildInvokeObject.mockRejectedValueOnce(
        new Error("Placeholder error")
      );

      // Should still complete successfully with fallback
      const result = await manager.executeHandler(
        "me",
        mockState,
        mockConfig,
        "who am i"
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["RESULT_FORMATTING"]);
    });

    it("should handle user service errors", async () => {
      const { userService } = require("../../../../utils/user-service.ts");
      userService.getUserName.mockRejectedValueOnce(
        new Error("User service error")
      );

      // Should still complete successfully with fallback
      const result = await manager.executeHandler(
        "me",
        mockState,
        mockConfig,
        "who am i"
      );

      expect(result).toBeInstanceOf(Command);
      expect(result?.goto).toEqual(["RESULT_FORMATTING"]);
    });
  });
});
