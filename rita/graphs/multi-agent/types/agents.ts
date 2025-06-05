/**
 * Represents the different types of agents in the system
 */
export enum AgentType {
  SUPERVISOR = "supervisor_agent",
  QUERY = "query_agent",
  MUTATION = "mutation_agent",
  TOOL = "tool_node"
}

/**
 * Represents the state of an agent
 */
export interface AgentState {
  /** Type of the agent */
  type: AgentType;
  /** Current status of the agent */
  status: 'idle' | 'busy' | 'error';
  /** Current task being processed, if any */
  currentTask?: string;
  /** Error message if the agent is in error state */
  error?: string;
  /** Additional agent-specific state */
  context: Record<string, any>;
}

/**
 * Represents a message between agents
 */
export interface AgentMessage {
  /** Sender agent type */
  from: AgentType;
  /** Recipient agent type */
  to: AgentType;
  /** Type of message */
  type: 'task' | 'result' | 'error' | 'request' | 'response';
  /** Message content */
  content: any;
  /** Timestamp of the message */
  timestamp: string;
  /** Message priority */
  priority: 'low' | 'medium' | 'high';
  /** Whether the message requires acknowledgment */
  requiresAck: boolean;
  /** Message ID for tracking */
  id: string;
} 