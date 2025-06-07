// Node Exports - Clean Architecture for Query Processing
// Following the user's 4-step recommendation:
// 1. Query Discovery Node - Discover queries from MCP
// 2. Intent Matching Node - Match user intent to query
// 3. Query Execution Node - Generate and execute queries
// 4. Query Workflow Node - Orchestrate the complete flow

export { queryDiscoveryNode } from './query-discovery-node';
export { intentMatchingNode } from './intent-matching-node';
export { queryExecutionNode } from './query-execution-node';
export { queryWorkflowNode } from './query-workflow-node';
export { typeDiscoveryNode } from './type-discovery-node';
export { typeProcessingNode } from './type-processing-node';

// Types
export interface QueryInfo {
  name: string;
  signature: string;
  description: string;
}

export interface IntentMatch {
  name: string;
  arguments: any;
  reason: string;
}

export interface QueryExecutionResult {
  result: any;
  selectedQuery: string;
  executedQuery: string | null;
} 