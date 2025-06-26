// Node Exports - Clean Architecture for Query and Mutation Processing
// Query Flow:
// 1. Query Discovery Node - Discover queries from MCP
// 2. Intent Matching Node - Match user intent to query
// 3. Type Discovery Node - Discover type information
// 4. Context Gathering Node - Gather type-aware parameter context
// 5. Query Generation Node - Generate GraphQL queries
// 6. Query Execution Node - Execute queries

// Mutation Flow:
// 1. Mutation Discovery Node - Discover mutations from MCP
// 2. Intent Matching Node - Match user intent to mutation
// 3. Type Discovery Node - Discover type information
// 4. Context Gathering Node - Gather type-aware parameter context
// 5. Mutation Generation Node - Generate GraphQL mutations
// 6. Mutation Execution Node - Execute mutations

export { queryDiscoveryNode } from "./query-discovery-node.js";
export { intentMatchingNode } from "./intent-matching-node.js";
export { contextGatheringNode } from "./context-gathering-node.js";
export { typeDiscoveryNode } from "./type-discovery-node.js";
export { queryGenerationNode } from "./query-generation-node.js";
export { queryExecutionNode } from "./query-execution-node.js";
export { resultFormattingNode } from "./result-formatting-node.js";
export { initialPlanNode } from "./initial-plan-node.js";

// Mutation processing nodes
export { mutationDiscoveryNode } from "./mutation-discovery-node.js";
export { mutationExecutionNode } from "./mutation-execution-node.js";
export { mutationGenerationNode } from "./mutation-generation-node.js";

// Types
export interface QueryInfo {
  name: string;
  description: string;
  document: any;
  variables?: Record<string, any>;
}

export interface MutationInfo {
  name: string;
  description: string;
  document: any;
  variables?: Record<string, any>;
}

export interface IntentMatch {
  name: string;
  type: "query" | "mutation";
  reason: string;
  confidence: number;
  variables?: Record<string, any>;
}

export interface QueryExecutionResult {
  success: boolean;
  data?: any;
  errors?: any[];
  metadata?: {
    queryName: string;
    executionTime: string;
    variables?: Record<string, any>;
  };
}

export interface MutationExecutionResult {
  success: boolean;
  data?: any;
  errors?: any[];
  metadata?: {
    mutationName: string;
    executionTime: string;
    variables?: Record<string, any>;
  };
}
