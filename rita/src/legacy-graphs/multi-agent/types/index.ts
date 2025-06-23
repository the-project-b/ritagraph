import { AgentType } from './agents';

/**
 * Represents a source of information with metadata
 */
export interface Source {
  /** Unique identifier for the source */
  id: string;
  /** URL or identifier of the source */
  url: string;
  /** Content extracted from the source */
  content: string;
  /** Timestamp when the source was accessed */
  timestamp: string;
  /** Confidence score for the source's reliability */
  confidence: number;
  /** Type of the source (e.g., 'web', 'database', 'file') */
  type: 'web' | 'database' | 'file' | 'other';
  /** Additional metadata about the source */
  metadata: Record<string, any>;
}

/**
 * Represents a citation linking information to its source
 */
export interface Citation {
  /** Unique identifier for the citation */
  id: string;
  /** ID of the source being cited */
  sourceId: string;
  /** The specific content being cited */
  content: string;
  /** Timestamp when the citation was created */
  timestamp: string;
  /** Confidence score for the citation's accuracy */
  confidence: number;
  /** Verification status of the citation */
  verificationStatus: 'unverified' | 'verified' | 'needs_verification';
  /** Agent that created the citation */
  agent: AgentType;
}

/**
 * Represents a data requirement for task execution
 */
export interface DataRequirement {
  /** Unique identifier for the requirement */
  id: string;
  /** Description of what data is needed */
  description: string;
  /** Type of data needed */
  dataType: string;
  /** Whether this is a required or optional requirement */
  required: boolean;
  /** Current status of the requirement */
  status: 'pending' | 'gathering' | 'completed' | 'failed';
  /** The actual data once gathered */
  data?: any;
  /** Error message if gathering failed */
  error?: string;
}

/**
 * Represents a task execution context
 */
export interface TaskContext {
  /** Current data requirements for the task */
  dataRequirements: DataRequirement[];
  /** Current execution phase */
  phase: 'initialization' | 'data_gathering' | 'execution' | 'completion';
  /** Additional context data */
  context: Record<string, any>;
  /** Number of retry attempts made for this task */
  retryCount?: number;
  /** Last error encountered during retries */
  lastError?: string;
  /** Gathered context for parameter resolution (task-specific) */
  gatheredContext?: any; // Will be GatheredContext but avoiding circular import
  /** Version timestamp for the gathered context */
  contextVersion?: string;
}

/**
 * Represents a single task in the workflow.
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  /** Human-readable description of the task */
  description: string;
  /** Type of operation: query for data retrieval, mutation for data modification, or type_details for GraphQL type introspection */
  type: 'query' | 'mutation';
  /** Target agent that should handle this task */
  targetAgent: 'query_agent' | 'mutation_agent';
  /** List of task IDs that must be completed before this task can start */
  dependencies: string[];
  /** Current execution status of the task */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** Result data from task execution, if completed successfully */
  result?: any;
  /** Error message if task failed */
  error?: string;
  /** Sources used in this task */
  sources: Source[];
  /** Citations created during task execution */
  citations: Citation[];
  /** Overall confidence score for the task's results */
  confidence: number;
  /** Verification status of the task's results */
  verificationStatus: 'unverified' | 'verified' | 'needs_verification';
  /** Execution context for the task */
  context: TaskContext;
  /** Details about the selected query/mutation */
  queryDetails?: {
    selectedQueryName?: string;
    selectionReason?: string;
    originalInputType?: string;
    originalOutputType?: string;
    skipSettings?: {
      skipDiscovery?: boolean;
      skipIntentMatching?: boolean;
      skipTypeDiscovery?: boolean;
      skipTypeProcessing?: boolean;
    };
    rawQueryDetails?: string;
    rawTypeDetails?: string;
    generatedQuery?: string;
    queryResult?: any;
    signature?: {
      name?: string;
      input?: {
        type: string;
        required: boolean;
      };
      output: {
        type: string;
        required: boolean;
      };
    };
  };
}

/**
 * Represents the complete state of all tasks in the workflow.
 */
export interface TaskState {
  /** List of all tasks in the workflow */
  tasks: Task[];
  /** Set of completed task IDs */
  completedTasks: Set<string>;
  /** Set of failed task IDs */
  failedTasks: Set<string>;
  /** Timestamp when execution started (for tracking total execution time) */
  executionStartTime?: number;
}

/**
 * Represents an agent's decision in the workflow
 */
export interface AgentDecision {
  agent: AgentType;
  timestamp: string;
  action: string;
  reason: string;
  remainingTasks?: string[];
  currentTaskIndex?: number;
}

/**
 * Represents a structured log entry
 */
export interface StructuredLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  agent: AgentType;
  event: string;
  details: Record<string, any>;
} 