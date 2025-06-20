// Context Gathering Node - Collects and processes context for parameter resolution
//
// HYBRID CONTEXT STORAGE SYSTEM:
//
// This node implements a sophisticated context management approach that stores
// gathered context in multiple locations for different use cases:
//
// 1. TASK-SPECIFIC STORAGE (task.context.gatheredContext):
//    - Stores context directly in each task for auditability
//    - Preserves historical context even after task completion
//    - Enables debugging and tracing of parameter resolution
//    - Perfect for understanding what context was used for each specific task
//
// 2. CONVERSATION-LEVEL STORAGE (state.memory.gatheredContext):
//    - Stores the most recent context for cross-task usage
//    - Enables subsequent tasks to use context from previous tasks
//    - Maintains backward compatibility with existing code
//    - Allows for context inheritance between related tasks
//
// 3. CONTEXT HISTORY (state.memory.contextHistory):
//    - Maintains a rolling history of the last 10 contexts
//    - Includes task metadata (taskId, taskType) for each context
//    - Enables analysis of context evolution across conversation
//    - Useful for debugging and conversation analytics
//
// CONTEXT RETRIEVAL STRATEGY:
// The ContextUtils.getMostRelevantContext() function implements smart fallback:
// 1. Current conversation-level context (most recent)
// 2. Task-specific context (if taskId provided)
// 3. Most recent context from history
//
// PLACEHOLDER SYSTEM INTEGRATION:
// This node now leverages the existing placeholder system for efficient user context gathering:
// - Uses placeholderManager.buildInvokeObject() for cached user data retrieval
// - Avoids duplicate API calls through the userService caching layer
// - Consistent with placeholder usage in intent-matching-node.ts special cases
// - Falls back to direct userService calls only if placeholder system fails
//
// PLACEHOLDER SYNTAX (GRAPHQL-SAFE):
// - {{variable}} - Mustache style (from LangSmith prompts and LLM generation)
// - <variable> - Angle bracket style (context gathering fallbacks only)
//
// CRITICAL: Single bracket {variable} syntax is AVOIDED to prevent conflicts
// with GraphQL object syntax like {field1, field2} and {variable: value}
//
// BENEFITS:
// - ✅ Task Auditability: Each task preserves its context snapshot
// - ✅ Cross-task Context: Tasks can use context from previous tasks
// - ✅ Memory Efficiency: History is limited to prevent memory bloat
// - ✅ Backward Compatibility: Existing code still works
// - ✅ Debugging Support: Full context traceability
// - ✅ Conversation Analytics: Context evolution tracking
// - ✅ Efficient User Context: Leverages cached placeholder data
// - ✅ GraphQL Safe: No conflicts with GraphQL syntax
//
// This node consolidates context from multiple sources:
// 1. Static extraction from user requests (now type-aware)
// 2. Dynamic context from completed tasks
// 3. User authentication context (via placeholder system)
// 4. Previous query results and patterns
// 5. Type information from Type Discovery Node
//
// The gathered context is stored in memory for use by subsequent nodes

import { Command } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import { Task, TaskState } from "../types";
import { getCompletedTasksContext } from "../tasks/tasks-handling";
import { safeCreateMemoryMap } from "../utils/memory-helpers";

/**
 * Context information structure
 */
export interface GatheredContext {
  staticContext: Record<string, any>;
  dynamicContext: Record<string, any>;
  userContext: Record<string, any>;
  typeContext: {
    requiredParameters: string[];
    optionalParameters: string[];
    parameterTypes: Record<string, string>;
    inputTypeName?: string;
    outputTypeName?: string;
  };
  extractedPatterns: {
    companyIds: string[];
    contractIds: string[];
    employeeIds: string[];
    userIds: string[];
    statusFilters: string[];
    dateRanges: Array<{ startDate?: string; endDate?: string; type: string }>;
  };
  resolutionStrategies: Array<{
    parameter: string;
    sources: string[];
    confidence: number;
    fallback?: string;
    required: boolean;
    type?: string;
  }>;
  contextAnalysis: {
    hasAllRequiredParams: boolean;
    missingRequiredParams: string[];
    availableDataTypes: string[];
    workflowSuggestions: Array<{
      missing: string;
      suggestion: string;
      action: string;
      queryType: string;
      userMessage: string;
    }>;
  };
  timestamp: string;
}

/**
 * Extended context with task metadata for history tracking
 */
export interface ContextHistoryEntry extends GatheredContext {
  taskId: string;
  taskType: string;
}

/**
 * Utility functions for context management
 */
export const ContextUtils = {
  /**
   * Get the current gathered context (most recent)
   */
  getCurrentContext(state: ExtendedState): GatheredContext | null {
    return (state.memory?.get("gatheredContext") as GatheredContext) || null;
  },

  /**
   * Get context for a specific task
   */
  getTaskContext(state: ExtendedState, taskId: string): GatheredContext | null {
    const taskState = state.memory?.get("taskState") as TaskState;
    if (!taskState) return null;

    const task = taskState.tasks.find((t) => t.id === taskId);
    return task?.context?.gatheredContext || null;
  },

  /**
   * Get context history for debugging/analysis
   */
  getContextHistory(state: ExtendedState): ContextHistoryEntry[] {
    return (state.memory?.get("contextHistory") as ContextHistoryEntry[]) || [];
  },

  /**
   * Find the most relevant context for parameter resolution
   * Prioritizes current context, then recent task contexts
   */
  getMostRelevantContext(
    state: ExtendedState,
    currentTaskId?: string
  ): GatheredContext | null {
    // First try current context
    const currentContext = this.getCurrentContext(state);
    if (currentContext) return currentContext;

    // Then try current task context
    if (currentTaskId) {
      const taskContext = this.getTaskContext(state, currentTaskId);
      if (taskContext) return taskContext;
    }

    // Finally try most recent from history
    const history = this.getContextHistory(state);
    return history.length > 0 ? history[history.length - 1] : null;
  },
};

/**
 * Extract type-aware parameter context from user request
 */
function extractStaticParameters(
  userRequest: string,
  typeInfo?: any
): Record<string, any> {
  const staticContext: Record<string, any> = {};
  const extractedPatterns = {
    companyIds: [] as string[],
    contractIds: [] as string[],
    employeeIds: [] as string[],
    userIds: [] as string[],
    statusFilters: [] as string[],
    dateRanges: [] as Array<{
      startDate?: string;
      endDate?: string;
      type: string;
    }>,
  };

  // Get required parameters from type info to be more targeted
  const requiredParams = typeInfo?.requiredParameters || [];
  const parameterTypes = typeInfo?.parameterTypes || {};

  // Company ID extraction patterns - prioritize if required
  const companyPatterns = [
    /company[:\s]+(["\']?)([a-zA-Z0-9_-]+)\1/gi,
    /for\s+company\s+(["\']?)([a-zA-Z0-9_-]+)\1/gi,
    /companyId[:\s]+(["\']?)([a-zA-Z0-9_-]+)\1/gi,
  ];

  companyPatterns.forEach((pattern) => {
    const matches = [...userRequest.matchAll(pattern)];
    matches.forEach((match) => {
      if (match[2]) {
        extractedPatterns.companyIds.push(match[2]);
        staticContext.companyId = match[2]; // Use last found as primary
      }
    });
  });

  // Contract ID extraction patterns - enhanced for array types
  const contractPatterns = [
    /contract[s]?[:\s]+(["\']?)([a-zA-Z0-9_,\s-]+)\1/gi,
    /contractId[s]?[:\s]+(["\']?)([a-zA-Z0-9_,\s-]+)\1/gi,
    /for\s+contract[s]?\s+(["\']?)([a-zA-Z0-9_,\s-]+)\1/gi,
  ];

  contractPatterns.forEach((pattern) => {
    const matches = [...userRequest.matchAll(pattern)];
    matches.forEach((match) => {
      if (match[2]) {
        const contractIds = match[2].split(/[,\s]+/).filter((id) => id.trim());
        extractedPatterns.contractIds.push(...contractIds);
        staticContext.contractIds = [...new Set(extractedPatterns.contractIds)];
      }
    });
  });

  // Employee ID extraction patterns - more specific to avoid matching emails
  const employeePatterns = [
    /employeeId[s]?[:\s]+(["\']?)([a-zA-Z0-9_,\s-]+)\1/gi,
    /employee[s]?\s+(?:id[s]?\s+)?(["\']?)([a-zA-Z0-9_,\s-]+)\1(?:\s|$|,)/gi,
    /for\s+employee[s]?\s+(["\']?)([a-zA-Z0-9_,\s-]+)\1(?:\s|$|,)/gi,
  ];

  // First extract emails separately to avoid conflicts
  const emailPatterns = [
    /email[s]?\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    /with\s+email\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
  ];

  const foundEmails: string[] = [];
  emailPatterns.forEach((pattern) => {
    const matches = [...userRequest.matchAll(pattern)];
    matches.forEach((match) => {
      if (match[1]) {
        foundEmails.push(match[1]);
        extractedPatterns.userIds.push(match[1]); // Store emails as userIds for now
      }
    });
  });

  // Store emails in static context for reference
  if (foundEmails.length > 0) {
    staticContext.emails = foundEmails;
  }

  employeePatterns.forEach((pattern) => {
    const matches = [...userRequest.matchAll(pattern)];
    matches.forEach((match) => {
      if (match[2]) {
        // Filter out email addresses and common non-ID words
        const employeeIds = match[2]
          .split(/[,\s]+/)
          .filter((id) => id.trim())
          .filter((id) => !id.includes("@")) // Exclude email addresses
          .filter(
            (id) =>
              !["with", "email", "for", "of", "and"].includes(id.toLowerCase())
          );

        if (employeeIds.length > 0) {
          extractedPatterns.employeeIds.push(...employeeIds);
          staticContext.employeeIds = [
            ...new Set(extractedPatterns.employeeIds),
          ];
        }
      }
    });
  });

  // Status extraction - check if status parameter is expected
  if (requiredParams.includes("status") || parameterTypes.status) {
    const statusPatterns = [
      /status[:\s]+(["\']?)(\w+)\1/gi,
      /with\s+status\s+(["\']?)(\w+)\1/gi,
    ];

    statusPatterns.forEach((pattern) => {
      const matches = [...userRequest.matchAll(pattern)];
      matches.forEach((match) => {
        if (match[2]) {
          const status = match[2].toUpperCase();
          extractedPatterns.statusFilters.push(status);
          staticContext.status = status;
        }
      });
    });

    // Common status keywords
    const statusKeywords = [
      "active",
      "pending",
      "completed",
      "cancelled",
      "draft",
    ];
    statusKeywords.forEach((keyword) => {
      if (userRequest.toLowerCase().includes(keyword)) {
        const status = keyword.toUpperCase();
        extractedPatterns.statusFilters.push(status);
        if (!staticContext.status) staticContext.status = status;
      }
    });
  }

  // Date range extraction - only if date parameters are expected
  const hasDateParams =
    requiredParams.some((p) => p.includes("date") || p.includes("Date")) ||
    Object.keys(parameterTypes).some(
      (p) => p.includes("date") || p.includes("Date")
    );

  if (hasDateParams) {
    const specificDatePattern =
      /(?:from|since)\s+([0-9]{4}-[0-9]{2}-[0-9]{2})(?:\s+(?:to|until)\s+([0-9]{4}-[0-9]{2}-[0-9]{2}))?/gi;
    const matches = [...userRequest.matchAll(specificDatePattern)];
    matches.forEach((match) => {
      const dateRange = {
        startDate: match[1],
        endDate: match[2] || undefined,
        type: "specific",
      };
      extractedPatterns.dateRanges.push(dateRange);
      staticContext.startDate = match[1];
      if (match[2]) staticContext.endDate = match[2];
    });

    // Relative date ranges
    const now = new Date();

    if (userRequest.toLowerCase().includes("last month")) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const dateRange = {
        startDate: lastMonth.toISOString().split("T")[0],
        endDate: lastMonthEnd.toISOString().split("T")[0],
        type: "last_month",
      };
      extractedPatterns.dateRanges.push(dateRange);
      staticContext.startDate = dateRange.startDate;
      staticContext.endDate = dateRange.endDate;
    }

    if (userRequest.toLowerCase().includes("this month")) {
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const dateRange = {
        startDate: thisMonthStart.toISOString().split("T")[0],
        endDate: now.toISOString().split("T")[0],
        type: "this_month",
      };
      extractedPatterns.dateRanges.push(dateRange);
      staticContext.startDate = dateRange.startDate;
      staticContext.endDate = dateRange.endDate;
    }

    if (userRequest.toLowerCase().includes("today")) {
      const today = now.toISOString().split("T")[0];
      const dateRange = {
        startDate: today,
        endDate: today,
        type: "today",
      };
      extractedPatterns.dateRanges.push(dateRange);
      staticContext.startDate = today;
      staticContext.endDate = today;
    }
  }

  return { ...staticContext, extractedPatterns };
}

/**
 * Extract dynamic context from completed tasks and previous results
 */
function extractDynamicContext(state: ExtendedState): Record<string, any> {
  const completedContext = getCompletedTasksContext(state);
  const dynamicContext: Record<string, any> = {
    ...completedContext.availableData,
  };

  // Extract IDs from previous query results
  if (completedContext.recentResults?.length > 0) {
    const contractIds = new Set<string>();
    const employeeIds = new Set<string>();
    const companyIds = new Set<string>();
    const userIds = new Set<string>();

    // Track if we found a list of employees
    let foundEmployeeList = false;
    let employeeListData: any[] = [];

    for (const result of completedContext.recentResults) {
      if (result?.data) {
        if (Array.isArray(result.data)) {
          // Check if this is a list of employees
          if (
            result.data.length > 0 &&
            (result.data[0].employeeId || result.data[0].employee?.id)
          ) {
            foundEmployeeList = true;
            employeeListData = result.data;
          }

          result.data.forEach((item) => {
            // Extract IDs from various possible field names
            if (item.contractId) contractIds.add(item.contractId);
            if (item.employeeId) employeeIds.add(item.employeeId);
            if (item.companyId) companyIds.add(item.companyId);
            if (item.userId) userIds.add(item.userId);

            // ENHANCED: Handle case where item.id is the employee ID
            if (item.id) {
              // Try to determine what type of ID this is based on context
              if (item.contractId !== undefined) {
                contractIds.add(item.id);
              } else if (item.employeeId !== undefined) {
                employeeIds.add(item.id);
              } else if (item.companyId !== undefined) {
                companyIds.add(item.companyId);
              } else if (
                item.firstName ||
                item.lastName ||
                item.email ||
                item.role ||
                item.employeeContract
              ) {
                // This looks like an employee object - use id as employeeId
                employeeIds.add(item.id);
                console.log(
                  "🔍 Detected employee object with id:",
                  item.id,
                  "fields:",
                  Object.keys(item)
                );
              }
            }

            // Check for nested employee data
            if (item.employee?.id) employeeIds.add(item.employee.id);
            if (item.employee?.employeeId)
              employeeIds.add(item.employee.employeeId);
          });
        } else if (typeof result.data === "object") {
          // Check if this is a list of employees in a different format
          if (result.data.employees && Array.isArray(result.data.employees)) {
            foundEmployeeList = true;
            employeeListData = result.data.employees;

            // Extract IDs from the nested employees array
            result.data.employees.forEach((emp) => {
              if (emp.employeeId) employeeIds.add(emp.employeeId);
              if (emp.id) employeeIds.add(emp.id);
              if (emp.employee?.id) employeeIds.add(emp.employee.id);
              if (emp.employee?.employeeId)
                employeeIds.add(emp.employee.employeeId);
            });
          }

          // Extract IDs from various possible field names
          if (result.data.contractId) contractIds.add(result.data.contractId);
          if (result.data.employeeId) employeeIds.add(result.data.employeeId);
          if (result.data.companyId) companyIds.add(result.data.companyId);
          if (result.data.userId) userIds.add(result.data.userId);

          // ENHANCED: Handle case where result.data.id is the employee ID
          if (result.data.id) {
            if (
              result.data.firstName ||
              result.data.lastName ||
              result.data.email ||
              result.data.role ||
              result.data.employeeContract
            ) {
              // This looks like an employee object - use id as employeeId
              employeeIds.add(result.data.id);
              console.log(
                "🔍 Detected single employee object with id:",
                result.data.id,
                "fields:",
                Object.keys(result.data)
              );
            }
          }

          // Check for nested employee data
          if (result.data.employee?.id)
            employeeIds.add(result.data.employee.id);
          if (result.data.employee?.employeeId)
            employeeIds.add(result.data.employee.employeeId);
        }
      }
    }

    // Store all available IDs
    if (contractIds.size > 0) {
      dynamicContext.availableContractIds = Array.from(contractIds);
      dynamicContext.contractId = dynamicContext.availableContractIds[0]; // Store first as default
    }
    if (employeeIds.size > 0) {
      dynamicContext.availableEmployeeIds = Array.from(employeeIds);

      // If we found a list of employees, store additional context
      if (foundEmployeeList) {
        dynamicContext.employeeList = employeeListData;
        dynamicContext.employeeIds = dynamicContext.availableEmployeeIds; // Store all IDs
        dynamicContext.hasEmployeeList = true;

        // Store employee details for reference
        dynamicContext.employeeDetails = employeeListData.map((emp) => ({
          id: emp.employeeId || emp.id || emp.employee?.id,
          name: emp.name || emp.employeeName || emp.employee?.name,
          email: emp.email || emp.employeeEmail || emp.employee?.email,
        }));

        // Set default employeeId from the list
        if (employeeListData.length > 0) {
          const firstEmployee = employeeListData[0];
          dynamicContext.employeeId =
            firstEmployee.employeeId ||
            firstEmployee.id ||
            firstEmployee.employee?.id;
          console.log(
            "🔍 Setting default employeeId from list:",
            dynamicContext.employeeId
          );
        }
      } else {
        // If no list found, use first available ID
        dynamicContext.employeeId = dynamicContext.availableEmployeeIds[0];
      }
    }
    if (companyIds.size > 0) {
      dynamicContext.availableCompanyIds = Array.from(companyIds);
      dynamicContext.companyId = dynamicContext.availableCompanyIds[0]; // Store first as default
    }
    if (userIds.size > 0) {
      dynamicContext.availableUserIds = Array.from(userIds);
      dynamicContext.userId = dynamicContext.availableUserIds[0]; // Store first as default
    }
  }

  // Add context about what data is available
  dynamicContext.hasUserInfo = !!completedContext.userInfo;
  dynamicContext.hasRecentResults = completedContext.recentResults?.length > 0;
  dynamicContext.completedTaskCount = completedContext.completedTasks.length;

  // Log available context for debugging
  console.log("🔍 Dynamic Context Available:", {
    hasEmployeeIds: dynamicContext.availableEmployeeIds?.length > 0,
    hasEmployeeList: dynamicContext.hasEmployeeList,
    employeeCount: dynamicContext.employeeList?.length,
    hasContractIds: dynamicContext.availableContractIds?.length > 0,
    hasCompanyIds: dynamicContext.availableCompanyIds?.length > 0,
    hasUserIds: dynamicContext.availableUserIds?.length > 0,
    employeeId: dynamicContext.employeeId,
    employeeIds: dynamicContext.employeeIds,
    contractId: dynamicContext.contractId,
    companyId: dynamicContext.companyId,
    userId: dynamicContext.userId,
  });

  return dynamicContext;
}

/**
 * Extract user context from authentication and user profile using placeholder system
 */
async function extractUserContext(
  state: ExtendedState,
  config: any
): Promise<Record<string, any>> {
  const completedContext = getCompletedTasksContext(state);
  const userContext: Record<string, any> = {};

  // From completed user info queries
  if (completedContext.userInfo) {
    userContext.userId = completedContext.userInfo.id;
    userContext.userEmail = completedContext.userInfo.email;
    userContext.companyId = completedContext.userInfo.companyId;

    if (completedContext.userInfo.contractIds) {
      userContext.userContractIds = completedContext.userInfo.contractIds;
    }

    if (completedContext.userInfo.department) {
      userContext.userDepartment = completedContext.userInfo.department;
    }

    if (completedContext.userInfo.role) {
      userContext.userRole = completedContext.userInfo.role;
    }
  }

  // From authentication config
  const authUser =
    (config as any)?.user ||
    (config as any)?.langgraph_auth_user ||
    ((config as any)?.configurable &&
      (config as any).configurable.langgraph_auth_user);

  if (authUser) {
    if (authUser.id && !userContext.userId) userContext.userId = authUser.id;
    if (authUser.email && !userContext.userEmail)
      userContext.userEmail = authUser.email;
    if (authUser.companyId && !userContext.companyId)
      userContext.companyId = authUser.companyId;
  }

  // ENHANCED: Use placeholder system to efficiently gather user context
  try {
    // Import both the manager and ensure placeholders are registered
    await import("../../../placeholders/index");
    const { placeholderManager } = await import(
      "../../../placeholders/manager"
    );

    // Use placeholder system to get all user context data efficiently
    const placeholderContext = await placeholderManager.buildInvokeObject("", {
      state: state as any,
      config,
    });

    // Map all available placeholder results to user context with comprehensive mapping
    const placeholderMapping = {
      auto_companyid: "companyId",
      auto_username: "userName",
      auto_companyname: "companyName",
      auto_user_summary: "userSummary",
      auto_contractIds: "contractIds",
    };

    // Apply placeholder mappings
    for (const [placeholderKey, contextKey] of Object.entries(
      placeholderMapping
    )) {
      if (placeholderContext[placeholderKey] && !userContext[contextKey]) {
        let value = placeholderContext[placeholderKey];

        // Special handling for contractIds - convert string to array if needed
        if (
          contextKey === "contractIds" &&
          typeof value === "string" &&
          value.includes(",")
        ) {
          value = value
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id);
        }

        userContext[contextKey] = value;
      }
    }

    // Also check for any other user-related data in placeholder context
    const userFields = [
      "userId",
      "userEmail",
      "userRole",
      "userLanguage",
      "userDepartment",
    ];
    for (const field of userFields) {
      if (placeholderContext[field] && !userContext[field]) {
        userContext[field] = placeholderContext[field];
      }
    }

    console.log("🔍 Context Gathering: Raw placeholder context:", {
      placeholderContext,
      mappedContext: userContext,
      availablePlaceholders: Object.keys(placeholderContext),
      resolvedFields: Object.keys(userContext).filter(
        (key) => userContext[key] !== undefined
      ),
    });
  } catch (error) {
    console.warn(
      "🔍 Context Gathering: Placeholder system error:",
      error.message
    );

    // Try direct userService calls without fallbacks
    try {
      const { userService } = await import("../../../utils/user-service");
      const context = { state: state as any, config };

      // Get raw values without fallbacks
      userContext.companyId = await userService.getCompanyId(context);
      userContext.userName = await userService.getUserName(context);
      userContext.companyName = await userService.getCompanyName(context);
      userContext.userEmail = await userService.getUserEmail(context);
      userContext.userRole = await userService.getUserRole(context);
      userContext.userLanguage = await userService.getUserLanguage(context);

      console.log("🔍 Context Gathering: Raw user service values:", {
        companyId: userContext.companyId,
        userName: userContext.userName,
        companyName: userContext.companyName,
        userEmail: userContext.userEmail,
        userRole: userContext.userRole,
        userLanguage: userContext.userLanguage,
      });
    } catch (fallbackError) {
      console.warn(
        "🔍 Context Gathering: User service error:",
        fallbackError.message
      );

      // ENHANCED: Final fallback - try to get companyId directly from config
      try {
        const authUser =
          (config as any)?.user ||
          (config as any)?.langgraph_auth_user ||
          ((config as any)?.configurable &&
            (config as any).configurable.langgraph_auth_user);

        if (authUser?.companyId) {
          userContext.companyId = authUser.companyId;
          console.log(
            "🔍 Context Gathering: Using companyId from config fallback:",
            authUser.companyId
          );
        } else {
          console.warn(
            "🔍 Context Gathering: No companyId available in config either:",
            {
              hasUser: !!(config as any)?.user,
              hasLanggraphAuthUser: !!(config as any)?.langgraph_auth_user,
              hasConfigurable: !!(config as any)?.configurable,
              configKeys: Object.keys(config || {}),
              authUserKeys: authUser ? Object.keys(authUser) : [],
            }
          );
        }
      } catch (configError) {
        console.warn(
          "🔍 Context Gathering: Config fallback error:",
          configError.message
        );
      }
    }
  }

  // Final debug log
  console.log("🔍 Context Gathering: Final user context:", {
    userContext,
    hasCompanyId: !!userContext.companyId,
    contextKeys: Object.keys(userContext),
    nonEmptyValues: Object.entries(userContext).filter(
      ([k, v]) => v !== undefined && v !== null && v !== ""
    ),
  });

  return userContext;
}

/**
 * Extract type context from type discovery results
 */
function extractTypeContext(currentTask: Task): GatheredContext["typeContext"] {
  const typeContext: GatheredContext["typeContext"] = {
    requiredParameters: [],
    optionalParameters: [],
    parameterTypes: {},
  };

  // Extract from queryDetails if available
  const selectedQuery = currentTask.queryDetails;
  if (selectedQuery) {
    typeContext.inputTypeName = selectedQuery.originalInputType;
    typeContext.outputTypeName = selectedQuery.originalOutputType;

    // Parse type information to extract ACTUAL input field parameters
    if (selectedQuery.rawTypeDetails) {
      // Look specifically for "Required Fields:" and "Optional Fields:" sections
      const requiredFieldsMatch = selectedQuery.rawTypeDetails.match(
        /Required Fields:\s*\n((?:\s*\w+:.*\n?)+)/
      );
      const optionalFieldsMatch = selectedQuery.rawTypeDetails.match(
        /Optional Fields:\s*\n((?:\s*\w+:.*\n?)+)/
      );

      // Extract required fields
      if (requiredFieldsMatch) {
        const fieldPattern = /^\s*(\w+):\s*([^\s!]+)!?/gm;
        let match;
        while ((match = fieldPattern.exec(requiredFieldsMatch[1])) !== null) {
          const [, paramName, paramType] = match;
          // Only include actual parameter names, not documentation words
          if (
            paramName &&
            paramName.length > 1 &&
            !paramName.includes("Field") &&
            !paramName.includes("Type")
          ) {
            typeContext.requiredParameters.push(paramName);
            typeContext.parameterTypes[paramName] = paramType.replace(/!/g, "");
          }
        }
      }

      // Extract optional fields
      if (optionalFieldsMatch) {
        const fieldPattern = /^\s*(\w+):\s*([^\s!]+)/gm;
        let match;
        while ((match = fieldPattern.exec(optionalFieldsMatch[1])) !== null) {
          const [, paramName, paramType] = match;
          // Only include actual parameter names, not documentation words
          if (
            paramName &&
            paramName.length > 1 &&
            !paramName.includes("Field") &&
            !paramName.includes("Type")
          ) {
            typeContext.optionalParameters.push(paramName);
            typeContext.parameterTypes[paramName] = paramType;
          }
        }
      }

      // ENHANCED: Handle simple format used in tests (e.g., "status: PaymentStatus", "companyId: String!, contractIds: [String!]!")
      if (
        typeContext.requiredParameters.length === 0 &&
        typeContext.optionalParameters.length === 0
      ) {
        // Parse simple field definitions with better support for complex types
        // Split by comma first to handle each field definition separately
        const fieldDefinitions = selectedQuery.rawTypeDetails
          .split(",")
          .map((def) => def.trim());

        for (const fieldDef of fieldDefinitions) {
          if (!fieldDef) continue;

          // Match pattern: fieldName: TypeDefinition
          const fieldMatch = fieldDef.match(/(\w+):\s*(.+)$/);
          if (fieldMatch) {
            const [, paramName, typeDefRaw] = fieldMatch;
            const typeDef = typeDefRaw.trim();

            if (paramName && paramName.length > 1) {
              // Clean the type definition for storage (remove all brackets and exclamation marks)
              const cleanType = typeDef.replace(/[\[\]!]/g, "");
              typeContext.parameterTypes[paramName] = cleanType;

              // Check if it's required - ends with ! (but not inside brackets)
              // Examples: String! = required, [String!]! = required array, [String!] = optional array of required strings
              const isRequired = typeDef.endsWith("!");
              if (isRequired) {
                typeContext.requiredParameters.push(paramName);
              } else {
                typeContext.optionalParameters.push(paramName);
              }
            }
          }
        }
      }

      // Final fallback: if no structured parsing worked, look for common input parameters
      if (
        typeContext.requiredParameters.length === 0 &&
        typeContext.optionalParameters.length === 0
      ) {
        // Look for common input type patterns
        const commonParams = [
          "companyId",
          "pagination",
          "conditionType",
          "data",
          "filter",
        ];
        commonParams.forEach((param) => {
          if (
            selectedQuery.rawTypeDetails
              .toLowerCase()
              .includes(param.toLowerCase())
          ) {
            typeContext.optionalParameters.push(param);
            typeContext.parameterTypes[param] = "String"; // Default type
          }
        });
      }
    }
  }

  return typeContext;
}

/**
 * Generate parameter resolution strategies with type awareness
 */
function generateResolutionStrategies(
  staticContext: Record<string, any>,
  dynamicContext: Record<string, any>,
  userContext: Record<string, any>,
  typeContext: GatheredContext["typeContext"]
): Array<{
  parameter: string;
  sources: string[];
  confidence: number;
  fallback?: string;
  required: boolean;
  type?: string;
}> {
  const strategies = [];

  // Create strategies for all known parameters (required + optional)
  const allParameters = [
    ...typeContext.requiredParameters,
    ...typeContext.optionalParameters,
  ];

  for (const parameter of allParameters) {
    const isRequired = typeContext.requiredParameters.includes(parameter);
    const paramType = typeContext.parameterTypes[parameter];

    const sources = [];
    let confidence = 0;

    // Check static context
    if (staticContext[parameter]) {
      sources.push("static_request");
      confidence = Math.max(confidence, 0.9);
    }

    // Check user context
    if (userContext[parameter]) {
      sources.push("user_context");
      confidence = Math.max(confidence, 0.8);
    }

    // Check dynamic context - try multiple approaches
    const dynamicKey = `available${
      parameter.charAt(0).toUpperCase() + parameter.slice(1)
    }`;
    const dynamicKeyPlural = `available${
      parameter.charAt(0).toUpperCase() + parameter.slice(1)
    }s`;

    // Check for array of available values (e.g., availableEmployeeIds)
    if (
      dynamicContext[dynamicKeyPlural] &&
      Array.isArray(dynamicContext[dynamicKeyPlural]) &&
      dynamicContext[dynamicKeyPlural].length > 0
    ) {
      sources.push("dynamic_context");
      confidence = Math.max(confidence, 0.6);
    }
    // Check for singular array (e.g., availableEmployeeId)
    else if (
      dynamicContext[dynamicKey] &&
      Array.isArray(dynamicContext[dynamicKey]) &&
      dynamicContext[dynamicKey].length > 0
    ) {
      sources.push("dynamic_context");
      confidence = Math.max(confidence, 0.6);
    }
    // Check for direct value (e.g., employeeId)
    else if (dynamicContext[parameter]) {
      sources.push("dynamic_context");
      confidence = Math.max(confidence, 0.7); // Higher confidence for direct value
    }

    // Special mappings for common parameter patterns
    if (parameter === "companyId") {
      if (userContext.companyId) {
        sources.push("user_context");
        confidence = Math.max(confidence, 0.8);
      }
    }

    if (parameter === "contractIds" || parameter === "contractId") {
      if (staticContext.contractIds?.length > 0) {
        sources.push("static_request");
        confidence = Math.max(confidence, 0.9);
      } else if (userContext.userContractIds?.length > 0) {
        sources.push("user_context");
        confidence = Math.max(confidence, 0.7);
      } else if (dynamicContext.availableContractIds?.length > 0) {
        sources.push("dynamic_context");
        confidence = Math.max(confidence, 0.6);
      } else if (
        userContext.contractIds &&
        (Array.isArray(userContext.contractIds)
          ? userContext.contractIds.length > 0
          : userContext.contractIds)
      ) {
        // Check for placeholder-provided contract IDs (string or array)
        sources.push("user_context");
        confidence = Math.max(confidence, 0.5);
      }
    }

    if (parameter === "employeeIds" || parameter === "employeeId") {
      if (staticContext.employeeIds?.length > 0) {
        sources.push("static_request");
        confidence = Math.max(confidence, 0.9);
      } else if (userContext.userEmployeeIds?.length > 0) {
        sources.push("user_context");
        confidence = Math.max(confidence, 0.7);
      } else if (dynamicContext.availableEmployeeIds?.length > 0) {
        sources.push("dynamic_context");
        confidence = Math.max(confidence, 0.6);
      } else if (dynamicContext.employeeId) {
        sources.push("dynamic_context");
        confidence = Math.max(confidence, 0.8); // High confidence for direct match
      }
    }

    // Handle compound parameters like employeeCompanyId
    if (parameter === "employeeCompanyId") {
      // This is typically the user's company ID in employee-related queries
      if (userContext.companyId) {
        sources.push("user_context");
        confidence = Math.max(confidence, 0.8); // High confidence since it's directly available
      } else if (staticContext.companyId) {
        sources.push("static_request");
        confidence = Math.max(confidence, 0.9);
      } else if (dynamicContext.companyId) {
        sources.push("dynamic_context");
        confidence = Math.max(confidence, 0.7);
      }
    }

    // Handle search parameter (used for email-based employee searches)
    if (parameter === "search") {
      // Check if we have emails in static context that can be used for search
      if (staticContext.emails && staticContext.emails.length > 0) {
        sources.push("static_request");
        confidence = Math.max(confidence, 0.9); // High confidence for email search
      }
      // Check if we have other searchable data in static context
      else if (
        staticContext.employeeIds &&
        staticContext.employeeIds.length > 0
      ) {
        sources.push("static_request");
        confidence = Math.max(confidence, 0.8);
      }
      // Check if we have dynamic context that could be used for search
      else if (
        dynamicContext.availableEmployeeIds &&
        dynamicContext.availableEmployeeIds.length > 0
      ) {
        sources.push("dynamic_context");
        confidence = Math.max(confidence, 0.6);
      }
    }

    // Handle status parameter (used for employeesByCompany and other queries)
    if (parameter === "status") {
      // Check if we have status in static context
      if (staticContext.status) {
        sources.push("static_request");
        confidence = Math.max(confidence, 0.9);
      }
      // Default to ACTIVE status for employee queries if not specified
      else if (
        typeContext.requiredParameters.includes("status") ||
        typeContext.optionalParameters.includes("status")
      ) {
        // This will be handled by default values in the query generation
        confidence = Math.max(confidence, 0.5);
      }
    }

    strategies.push({
      parameter,
      sources,
      confidence,
      fallback:
        isRequired && sources.length === 0 ? `<${parameter}>` : undefined,
      required: isRequired,
      type: paramType,
    });
  }

  return strategies.filter(
    (strategy) => strategy.sources.length > 0 || strategy.required
  );
}

/**
 * Context Gathering Node - Main function
 */
export const contextGatheringNode = async (
  state: ExtendedState,
  config: any
) => {
  const startTime = Date.now();
  logEvent("info", AgentType.TOOL, "context_gathering_start", { startTime });

  try {
    // Get current task and user request
    const taskState = state.memory?.get("taskState") as TaskState;
    const userRequest =
      (state.memory?.get("userRequest") as string) ||
      (state.memory?.get("lastProcessedMessage") as string) ||
      ((state.messages && state.messages.length > 0
        ? state.messages
            .filter((msg) => msg.constructor.name === "HumanMessage")
            .map((msg) => msg.content)
            .pop()
        : "") as string);

    if (!taskState || !userRequest) {
      throw new Error(
        "Missing task state or user request for context gathering"
      );
    }

    const currentTaskIndex = taskState.tasks.findIndex(
      (task) => task.status === "in_progress"
    );
    const currentTask = taskState.tasks[currentTaskIndex];

    if (!currentTask) {
      throw new Error("No current task found");
    }

    logEvent("info", AgentType.TOOL, "gathering_context", {
      userRequest: userRequest?.substring(0, 100),
      currentTaskId: currentTask?.id,
      taskType: currentTask?.type,
      hasTypeInfo: !!currentTask.queryDetails,
    });

    // Extract type context from type discovery results
    const typeContext = extractTypeContext(currentTask);

    // Extract context from different sources (now type-aware)
    const staticResult = extractStaticParameters(userRequest, typeContext);
    const staticContext = { ...staticResult };
    delete staticContext.extractedPatterns;

    const dynamicContext = extractDynamicContext(state);
    const userContext = await extractUserContext(state, config);

    // Generate resolution strategies with type awareness
    const resolutionStrategies = generateResolutionStrategies(
      staticContext,
      dynamicContext,
      userContext,
      typeContext
    );

    // ENHANCED: Analyze resolution strategies for workflow suggestions
    const unresolvedRequired = resolutionStrategies.filter(
      (s) => s.required && s.sources.length === 0
    );
    const contextAnalysis = {
      hasAllRequiredParams: unresolvedRequired.length === 0,
      missingRequiredParams: unresolvedRequired.map((s) => s.parameter),
      availableDataTypes: Object.keys(dynamicContext).filter(
        (key) =>
          key.startsWith("available") ||
          key.endsWith("List") ||
          key.endsWith("Id")
      ),
      workflowSuggestions: [],
    };

    // Generate workflow suggestions for missing parameters
    if (unresolvedRequired.length > 0) {
      for (const missing of unresolvedRequired) {
        if (
          missing.parameter === "employeeId" &&
          !dynamicContext.availableEmployeeIds
        ) {
          // Check if we have an email but need employeeId - this is problematic since no query supports email search
          if (staticContext.emails && staticContext.emails.length > 0) {
            contextAnalysis.workflowSuggestions.push({
              missing: "employeeId",
              suggestion: "email_search_not_supported",
              action:
                "Email-based employee search is not supported by available queries",
              queryType: "limitation",
              userMessage: `I found the email ${staticContext.emails[0]}, but unfortunately none of the available employee queries support searching by email address. The "employeesByCompany" query only searches by company and status. You may need to search by the employee's name instead.`,
            });
          } else {
            contextAnalysis.workflowSuggestions.push({
              missing: "employeeId",
              suggestion: "prerequisite_query",
              action: "Run employee list query first",
              queryType: "employee_list",
              userMessage:
                "I need employee information first. Let me get the employee list for you.",
            });
          }
        } else if (
          missing.parameter === "contractId" &&
          !dynamicContext.availableContractIds
        ) {
          contextAnalysis.workflowSuggestions.push({
            missing: "contractId",
            suggestion: "prerequisite_query",
            action: "Run contract list query first",
            queryType: "contract_list",
            userMessage:
              "I need contract information first. Let me get the contract list for you.",
          });
        }
      }
    }

    // Create comprehensive context object
    const gatheredContext: GatheredContext = {
      staticContext,
      dynamicContext,
      userContext,
      typeContext,
      extractedPatterns: staticResult.extractedPatterns,
      resolutionStrategies,
      contextAnalysis,
      timestamp: new Date().toISOString(),
    };

    // HYBRID STORAGE APPROACH:
    // 1. Store in task-specific context (for task history and debugging)
    const updatedTasks = [...taskState.tasks];
    updatedTasks[currentTaskIndex] = {
      ...currentTask,
      context: {
        ...currentTask.context,
        gatheredContext, // Store full context in task
        contextVersion: gatheredContext.timestamp,
      },
    };

    // 2. Store in conversation-level memory (for cross-task usage)
    const updatedMemory = safeCreateMemoryMap(state.memory);
    updatedMemory.set("gatheredContext", gatheredContext);

    // 3. Also maintain conversation-level context history
    const contextHistory =
      (updatedMemory.get("contextHistory") as ContextHistoryEntry[]) || [];
    const historyEntry: ContextHistoryEntry = {
      ...gatheredContext,
      taskId: currentTask.id,
      taskType: currentTask.type,
    };
    contextHistory.push(historyEntry);

    // Keep only last 10 contexts to prevent memory bloat
    if (contextHistory.length > 10) {
      contextHistory.splice(0, contextHistory.length - 10);
    }
    updatedMemory.set("contextHistory", contextHistory);

    // Update task state with new task context
    const updatedTaskState = {
      ...taskState,
      tasks: updatedTasks,
    };
    updatedMemory.set("taskState", updatedTaskState);

    // CRITICAL: Preserve userRequest for result formatting
    updatedMemory.set("userRequest", userRequest);
    console.log("🔧 CONTEXT_GATHERING - Preserved userRequest:", userRequest);

    logEvent("info", AgentType.TOOL, "context_gathering_completed", {
      duration: Date.now() - startTime,
      staticParams: Object.keys(staticContext).length,
      dynamicParams: Object.keys(dynamicContext).length,
      userParams: Object.keys(userContext).length,
      staticContext: Object.keys(staticContext),
      userContext: Object.keys(userContext),
      companyIdFound: !!userContext.companyId,
      companyIdValue: userContext.companyId,
      typeParams: {
        required: typeContext.requiredParameters.length,
        optional: typeContext.optionalParameters.length,
        types: Object.keys(typeContext.parameterTypes).length,
      },
      strategies: resolutionStrategies.length,
      unresolved: resolutionStrategies
        .filter((s) => s.sources.length === 0 && s.required)
        .map((s) => s.parameter),
      extractedPatterns: {
        companyIds: staticResult.extractedPatterns.companyIds.length,
        contractIds: staticResult.extractedPatterns.contractIds.length,
        employeeIds: staticResult.extractedPatterns.employeeIds.length,
        dateRanges: staticResult.extractedPatterns.dateRanges.length,
      },
      storageApproach: "hybrid", // Task + Conversation level
      contextHistorySize: contextHistory.length,
    });

    // Determine next node based on task type
    const nextNode =
      currentTask?.type === "mutation"
        ? "MUTATION_GENERATION"
        : "QUERY_GENERATION";

    return new Command({
      goto: nextNode,
      update: {
        messages: state.messages,
        memory: updatedMemory,
      },
    });
  } catch (error) {
    logEvent("error", AgentType.TOOL, "context_gathering_error", {
      error: error.message,
    });

    // CRITICAL FIX: Don't throw errors, mark task as failed and continue
    const taskState = state.memory?.get("taskState");
    const currentTaskIndex = taskState?.tasks.findIndex(
      (task) => task.status === "in_progress"
    );

    if (currentTaskIndex >= 0 && taskState) {
      const currentTask = taskState.tasks[currentTaskIndex];
      const updatedTaskState = {
        ...taskState,
        tasks: taskState.tasks.map((task) =>
          task.id === currentTask.id
            ? {
                ...task,
                status: "failed" as const,
                error: `Context gathering failed: ${error.message}`,
              }
            : task
        ),
        failedTasks: new Set([...taskState.failedTasks, currentTask.id]),
      };

      const updatedMemory = safeCreateMemoryMap(state.memory);
      updatedMemory.set("taskState", updatedTaskState);

      // Preserve userRequest
      const userRequest = state.memory?.get("userRequest");
      if (userRequest) {
        updatedMemory.set("userRequest", userRequest);
      }

      return new Command({
        goto: AgentType.SUPERVISOR,
        update: {
          messages: [
            ...state.messages,
            new AIMessage({
              content: `Context gathering failed: ${error.message}`,
            }),
          ],
          memory: updatedMemory,
        },
      });
    }

    // Fallback if no task state
    return new Command({
      goto: AgentType.SUPERVISOR,
      update: {
        messages: [
          ...state.messages,
          new AIMessage({
            content: `Context gathering failed: ${error.message}`,
          }),
        ],
        memory: state.memory,
      },
    });
  }
};
