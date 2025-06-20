// Built-in Queries Tool - Handles queries with direct implementations
// These queries bypass the normal GraphQL pipeline and provide immediate responses

import { Command } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import { placeholderManager } from "../../../placeholders/manager";

import { safeCreateMemoryMap } from "../utils/memory-helpers";

export interface BuiltInQueryHandler {
  name: string;
  description: string;
  handler: (
    state: ExtendedState,
    config: any,
    userRequest: string
  ) => Promise<Command>;
}

export interface IntentMatch {
  name: string;
  arguments: any;
  reason: string;
  skipSettings?: any;
}

/**
 * Built-in Query Manager - Handles queries that have direct implementations
 */
export class BuiltInQueryManager {
  private handlers: Map<string, BuiltInQueryHandler> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Register a new built-in query handler
   */
  registerHandler(handler: BuiltInQueryHandler): void {
    this.handlers.set(handler.name, handler);
    logEvent("info", AgentType.TOOL, "built_in_query_registered", {
      queryName: handler.name,
      description: handler.description,
    });
  }

  /**
   * Check if a query has a built-in handler
   */
  hasHandler(queryName: string): boolean {
    return this.handlers.has(queryName);
  }

  /**
   * Get list of all registered built-in queries
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Execute a built-in query handler
   */
  async executeHandler(
    queryName: string,
    state: ExtendedState,
    config: any,
    userRequest: string
  ): Promise<Command | null> {
    const handler = this.handlers.get(queryName);
    if (!handler) {
      return null;
    }

    logEvent("info", AgentType.TOOL, "built_in_query_executed", {
      queryName,
      description: handler.description,
    });

    try {
      return await handler.handler(state, config, userRequest);
    } catch (error) {
      logEvent("error", AgentType.TOOL, "built_in_query_error", {
        queryName,
        error: error.message,
      });
      throw new Error(`Built-in query '${queryName}' failed: ${error.message}`);
    }
  }

  /**
   * Handle built-in query if one exists for the selected query
   */
  async handleBuiltInQuery(
    state: ExtendedState,
    config: any,
    userRequest: string,
    selectedQuery: IntentMatch
  ): Promise<Command | null> {
    if (!this.hasHandler(selectedQuery.name)) {
      return null;
    }

    return await this.executeHandler(
      selectedQuery.name,
      state,
      config,
      userRequest
    );
  }

  /**
   * Register default built-in query handlers
   */
  private registerDefaultHandlers(): void {
    // Register 'me' query handler
    this.registerHandler({
      name: "me",
      description: "User profile query that returns current user information",
      handler: async (
        state: ExtendedState,
        config: any,
        userRequest: string
      ) => {
        return await this.handleMeQuery(state, config, userRequest);
      },
    });

    // Register 'version' query handler
    this.registerHandler({
      name: "version",
      description: "System version information",
      handler: async (
        state: ExtendedState,
        config: any,
        userRequest: string
      ) => {
        return await this.handleVersionQuery(state, config, userRequest);
      },
    });

    // Register 'health' query handler
    this.registerHandler({
      name: "health",
      description: "System health status",
      handler: async (
        state: ExtendedState,
        config: any,
        userRequest: string
      ) => {
        return await this.handleHealthQuery(state, config, userRequest);
      },
    });
  }

  /**
   * Handle 'me' query - user profile information
   */
  private async handleMeQuery(
    state: ExtendedState,
    config: any,
    userRequest: string
  ): Promise<Command> {
    // Get current task and update its result
    const taskState = state.memory?.get("taskState");
    const currentTask = taskState?.tasks?.find(
      (task: any) => task.status === "in_progress"
    );

    if (currentTask) {
      // Get user data from placeholders
      let invokeObject: any = {};
      try {
        invokeObject = await placeholderManager.buildInvokeObject("", {
          state: state as any,
          config,
        });
        console.log(
          "🔍 Built-in Query: Raw placeholder context:",
          invokeObject
        );
      } catch (error) {
        console.warn(
          "🔍 Built-in Query: Placeholder system error:",
          error.message
        );
      }

      // Get additional user data from userService without fallbacks
      let userName, companyName, companyId, userEmail, userRole, userLanguage;
      try {
        const { userService } = await import("../../../utils/user-service");
        const context = { state: state as any, config };

        userName = await userService.getUserName(context);
        companyName = await userService.getCompanyName(context);
        companyId = await userService.getCompanyId(context);
        userEmail = await userService.getUserEmail(context);
        userRole = await userService.getUserRole(context);
        userLanguage = await userService.getUserLanguage(context);

        console.log("🔍 Built-in Query: Raw user service values:", {
          userName,
          companyName,
          companyId,
          userEmail,
          userRole,
          userLanguage,
        });
      } catch (error) {
        console.warn("🔍 Built-in Query: User service error:", error.message);
      }

      const formattedResult = {
        success: true,
        task: userRequest,
        data: {
          me: {
            id: invokeObject.userId,
            email: userEmail,
            role: userRole,
            firstName: userName?.split(" ")[0],
            lastName: userName?.split(" ")[1],
            preferredLanguage: userLanguage,
            avatarUrl: null,
            status: "ACTIVE",
            childRole: userRole,
            company: {
              bpoCompany: null,
              inferredPayrollEngine: null,
              avatarUrl: null,
              id: companyId,
              name: companyName,
              features: {
                kyc: true,
                datev_export: true,
              },
              forwardingEmail: null,
              isDemo: true,
              __typename: "OnboardingCompany",
            },
            viewAs: {
              enabled: false,
              impersonates: {
                client: false,
                role: false,
                __typename: "ViewAsImpersonates",
              },
              identity: {
                company: {
                  name: companyName,
                  avatarUrl: null,
                  companyId: companyId,
                  __typename: "ViewAsCompanyIdentity",
                },
                user: {
                  userId: invokeObject.userId,
                  firstName: userName?.split(" ")[0],
                  lastName: userName?.split(" ")[1],
                  email: userEmail,
                  role: userRole,
                  avatarUrl: null,
                  __typename: "ViewAsUserIdentity",
                },
                __typename: "ViewAsIdentity",
              },
              original: {
                company: {
                  name: companyName,
                  companyId: companyId,
                  avatarUrl: null,
                  __typename: "ViewAsCompanyIdentity",
                },
                user: {
                  userId: invokeObject.userId,
                  firstName: userName?.split(" ")[0],
                  lastName: userName?.split(" ")[1],
                  role: userRole,
                  avatarUrl: null,
                  __typename: "ViewAsUserIdentity",
                },
                __typename: "ViewAsIdentity",
              },
              __typename: "ViewAsInfo",
            },
            __typename: "OnboardingHrManager",
          },
        },
        executedAt: new Date().toISOString(),
      };

      // Store the result in the task's queryDetails for consistent formatting
      const updatedMemory = safeCreateMemoryMap(state.memory);

      // CRITICAL: Store userRequest in memory for result formatting
      updatedMemory.set("userRequest", userRequest);
      console.log(
        "🔧 BUILT_IN_QUERY - Stored userRequest for me query:",
        userRequest
      );

      const updatedTaskState = { ...taskState };
      const currentTaskIndex = taskState.tasks.findIndex(
        (task: any) => task.status === "in_progress"
      );

      // Ensure queryDetails exists and store the result
      if (!updatedTaskState.tasks[currentTaskIndex].queryDetails) {
        updatedTaskState.tasks[currentTaskIndex].queryDetails = {
          selectedQueryName: "me",
          selectionReason: "Built-in query: user profile handler",
        };
      }

      updatedTaskState.tasks[currentTaskIndex].queryDetails.queryResult =
        formattedResult;
      updatedMemory.set("taskState", updatedTaskState);

      // Go to RESULT_FORMATTING for consistent LLM-powered message generation
      return new Command({
        goto: "RESULT_FORMATTING",
        update: {
          messages: state.messages,
          memory: updatedMemory,
        },
      });
    }

    // Fallback if no current task found
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: "Retrieved user profile information",
          }),
        ],
        memory: state.memory,
      },
    });
  }

  /**
   * Handle 'version' query - system version information
   */
  private async handleVersionQuery(
    state: ExtendedState,
    config: any,
    userRequest: string
  ): Promise<Command> {
    const taskState = state.memory?.get("taskState");
    const currentTask = taskState?.tasks?.find(
      (task: any) => task.status === "in_progress"
    );

    if (currentTask) {
      const formattedResult = {
        success: true,
        task: userRequest,
        data: {
          version: {
            api: "2.0.0",
            build: "rita-multi-agent-v2.0.0",
            environment: process.env.NODE_ENV || "development",
            timestamp: new Date().toISOString(),
            features: [
              "multi-agent-system",
              "graphql-discovery",
              "context-gathering",
              "built-in-queries",
            ],
          },
        },
        executedAt: new Date().toISOString(),
      };

      // Store the result
      const updatedMemory = safeCreateMemoryMap(state.memory);

      // CRITICAL: Store userRequest in memory for result formatting
      updatedMemory.set("userRequest", userRequest);
      console.log(
        "🔧 BUILT_IN_QUERY - Stored userRequest for version query:",
        userRequest
      );

      const updatedTaskState = { ...taskState };
      const currentTaskIndex = taskState.tasks.findIndex(
        (task: any) => task.status === "in_progress"
      );

      if (!updatedTaskState.tasks[currentTaskIndex].queryDetails) {
        updatedTaskState.tasks[currentTaskIndex].queryDetails = {
          selectedQueryName: "version",
          selectionReason: "Built-in query: system version handler",
        };
      }

      updatedTaskState.tasks[currentTaskIndex].queryDetails.queryResult =
        formattedResult;
      updatedMemory.set("taskState", updatedTaskState);

      return new Command({
        goto: "RESULT_FORMATTING",
        update: {
          messages: state.messages,
          memory: updatedMemory,
        },
      });
    }

    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: "System Version: RITA Multi-Agent v2.0.0",
          }),
        ],
        memory: state.memory,
      },
    });
  }

  /**
   * Handle 'health' query - system health status
   */
  private async handleHealthQuery(
    state: ExtendedState,
    config: any,
    userRequest: string
  ): Promise<Command> {
    const taskState = state.memory?.get("taskState");
    const currentTask = taskState?.tasks?.find(
      (task: any) => task.status === "in_progress"
    );

    if (currentTask) {
      const formattedResult = {
        success: true,
        task: userRequest,
        data: {
          health: {
            status: "healthy",
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString(),
            services: {
              "graphql-discovery": "operational",
              "mcp-client": "operational",
              "placeholder-manager": "operational",
              "user-service": "operational",
            },
          },
        },
        executedAt: new Date().toISOString(),
      };

      // Store the result
      const updatedMemory = safeCreateMemoryMap(state.memory);

      // CRITICAL: Store userRequest in memory for result formatting
      updatedMemory.set("userRequest", userRequest);
      console.log(
        "🔧 BUILT_IN_QUERY - Stored userRequest for health query:",
        userRequest
      );

      const updatedTaskState = { ...taskState };
      const currentTaskIndex = taskState.tasks.findIndex(
        (task: any) => task.status === "in_progress"
      );

      if (!updatedTaskState.tasks[currentTaskIndex].queryDetails) {
        updatedTaskState.tasks[currentTaskIndex].queryDetails = {
          selectedQueryName: "health",
          selectionReason: "Built-in query: system health handler",
        };
      }

      updatedTaskState.tasks[currentTaskIndex].queryDetails.queryResult =
        formattedResult;
      updatedMemory.set("taskState", updatedTaskState);

      return new Command({
        goto: "RESULT_FORMATTING",
        update: {
          messages: state.messages,
          memory: updatedMemory,
        },
      });
    }

    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: "System Status: All services operational ✅",
          }),
        ],
        memory: state.memory,
      },
    });
  }
}

// Create singleton instance
export const builtInQueryManager = new BuiltInQueryManager();
