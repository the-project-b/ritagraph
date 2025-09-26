import { AgentErrorType } from "./agent-error-to-reason";

export enum AgentActionType {
  TOOL_CALL_ENTER = "TOOL_CALL_ENTER",
  TOOL_CALL_LOG = "TOOL_CALL_LOG",
  TOOL_CALL_RESPONSE = "TOOL_CALL_RESPONSE",
  AGENT_QUESTION_TO_USER = "AGENT_QUESTION_TO_USER",
  TOOL_LOAD_REQUESTED = "TOOL_LOAD_REQUESTED",
}

export enum AgentLogEventTag {
  DATA_CHANGE_PROPOSAL = "DATA_CHANGE_PROPOSAL",
}

export type AgentLogEventToolLoadRequestedPayload = {
  toolName: string;
};

export type AgentLogEvent = {
  description: string;
  actionName: string;
  actionType: AgentActionType;
  payload?: unknown;
  /** Used to connect related logs (e.g. from the same tool call) */
  relationId: string;
  /** Logical run identifier grouping all events for a run */
  runId: string;
  tags?: Array<AgentLogEventTag>;
  createdAt: string;
  errorType?: AgentErrorType;
};

/**
 * Minimal in-memory logger to capture agent actions per run.
 */
export default class AgentActionLogger {
  private readonly logsByRun: Map<string, AgentLogEvent[]>;

  private constructor(initialLogs: AgentLogEvent[] = []) {
    this.logsByRun = new Map<string, AgentLogEvent[]>();
    if (initialLogs.length > 0) {
      for (const event of initialLogs) {
        this.appendLog(event);
      }
    }
  }

  /** Create a logger pre-populated with the provided logs. */
  static fromLogs(logs: AgentLogEvent[] = []): AgentActionLogger {
    return new AgentActionLogger(logs);
  }

  /** Append a single event to the store. */
  appendLog(event: Omit<AgentLogEvent, "createdAt">): void {
    const existing = this.logsByRun.get(event.runId);
    const newEvent = { ...event, createdAt: new Date().toISOString() };

    if (existing) {
      existing.push(newEvent);
    } else {
      this.logsByRun.set(event.runId, [newEvent]);
    }
  }

  /** Return all logs across all runs. */
  getLogs(): AgentLogEvent[] {
    const all: AgentLogEvent[] = [];
    for (const events of this.logsByRun.values()) {
      all.push(...events);
    }
    return all;
  }

  getRelatedLogs(relationId: string): AgentLogEvent[] {
    return this.getLogs().filter((log) => log.relationId === relationId);
  }

  /** Return logs for a specific run. */
  getLogsOfRun(runId: string): AgentLogEvent[] {
    return this.logsByRun.get(runId) ?? [];
  }
}
