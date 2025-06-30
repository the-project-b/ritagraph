/**
 * Execution State Manager
 * 
 * Centralized management of agent execution states for task resumption.
 * Handles state persistence, retrieval, and cleanup across all agent types.
 */

export interface AgentExecutionState {
  agentType: 'query_agent' | 'mutation_agent';
  taskId: string;
  timestamp: string;
  state: any;
}

export class ExecutionStateManager {
  private states: Map<string, AgentExecutionState> = new Map();

  /**
   * Save execution state for a specific task and agent type
   */
  saveState(taskId: string, agentType: AgentExecutionState['agentType'], state: any): void {
    const key = this.getKey(taskId, agentType);
    
    const executionState: AgentExecutionState = {
      agentType,
      taskId,
      timestamp: new Date().toISOString(),
      state
    };

    this.states.set(key, executionState);
    
    console.log(`🗃️ EXECUTION STATE - Saved state for ${agentType} on task ${taskId}`);
    console.log(`🗃️ EXECUTION STATE - State keys:`, Object.keys(state));
  }

  /**
   * Get execution state for a specific task and agent type
   */
  getState(taskId: string, agentType: AgentExecutionState['agentType']): any | null {
    const key = this.getKey(taskId, agentType);
    const executionState = this.states.get(key);
    
    if (executionState) {
      console.log(`🗃️ EXECUTION STATE - Retrieved state for ${agentType} on task ${taskId}`);
      console.log(`🗃️ EXECUTION STATE - State age: ${Date.now() - new Date(executionState.timestamp).getTime()}ms`);
      return executionState.state;
    }
    
    console.log(`🗃️ EXECUTION STATE - No state found for ${agentType} on task ${taskId}`);
    return null;
  }

  /**
   * Clear execution state for a specific task and agent type
   */
  clearState(taskId: string, agentType: AgentExecutionState['agentType']): void {
    const key = this.getKey(taskId, agentType);
    const removed = this.states.delete(key);
    
    if (removed) {
      console.log(`🗃️ EXECUTION STATE - Cleared state for ${agentType} on task ${taskId}`);
    }
  }

  /**
   * Clear all execution states for a specific task (when task completes)
   */
  clearTaskStates(taskId: string): void {
    const keysToRemove: string[] = [];
    
    for (const [key, state] of this.states) {
      if (state.taskId === taskId) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => this.states.delete(key));
    
    if (keysToRemove.length > 0) {
      console.log(`🗃️ EXECUTION STATE - Cleared ${keysToRemove.length} states for completed task ${taskId}`);
    }
  }

  /**
   * Get all execution states (for debugging)
   */
  getAllStates(): AgentExecutionState[] {
    return Array.from(this.states.values());
  }

  /**
   * Clear expired states (older than specified age in milliseconds)
   */
  clearExpiredStates(maxAge: number = 24 * 60 * 60 * 1000): void { // Default: 24 hours
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    for (const [key, state] of this.states) {
      const age = now - new Date(state.timestamp).getTime();
      if (age > maxAge) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => this.states.delete(key));
    
    if (keysToRemove.length > 0) {
      console.log(`🗃️ EXECUTION STATE - Cleared ${keysToRemove.length} expired states`);
    }
  }

  /**
   * Get statistics about stored states
   */
  getStats(): { totalStates: number; statesByAgent: Record<string, number>; oldestState: string | null } {
    const statesByAgent: Record<string, number> = {};
    let oldestTimestamp: string | null = null;
    
    for (const state of this.states.values()) {
      statesByAgent[state.agentType] = (statesByAgent[state.agentType] || 0) + 1;
      
      if (!oldestTimestamp || state.timestamp < oldestTimestamp) {
        oldestTimestamp = state.timestamp;
      }
    }
    
    return {
      totalStates: this.states.size,
      statesByAgent,
      oldestState: oldestTimestamp
    };
  }

  /**
   * Generate unique key for task-agent combination
   */
  private getKey(taskId: string, agentType: AgentExecutionState['agentType']): string {
    return `${taskId}:${agentType}`;
  }
}

// Singleton instance
export const executionStateManager = new ExecutionStateManager(); 