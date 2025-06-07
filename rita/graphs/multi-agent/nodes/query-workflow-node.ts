// Query Workflow Orchestrator Node
// Coordinates the 4-step query process: Discovery → Intent Matching → Query Execution

import { Command } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import { queryDiscoveryNode } from "./query-discovery-node";
import { intentMatchingNode } from "./intent-matching-node";
import { typeDiscoveryNode } from "./type-discovery-node";
import { typeProcessingNode } from "./type-processing-node";
import { queryExecutionNode } from "./query-execution-node";
import { updateTaskResultInState } from "../tasks/tasks-handling";

interface SkipSettings {
  skipDiscovery?: boolean;
  skipIntentMatching?: boolean;
  skipTypeDiscovery?: boolean;
  skipTypeProcessing?: boolean;
}

/**
 * Query Workflow Node - Orchestrates the complete query flow
 * Following the user's 4-step architecture:
 * 1. Discover Queries (with caching)
 * 2. Match Query to Intent  
 * 3. Type Discovery & Processing
 * 4. Execute Query
 */
export const queryWorkflowNode = async (state: ExtendedState, config: any) => {
  const startTime = Date.now();
  logEvent('info', AgentType.QUERY, 'workflow_start', { startTime });

  try {
    // Get the current task from task state
    const taskState = state.memory?.get('taskState');
    if (!taskState) {
      throw new Error('No task state found');
    }

    // Find the current task in progress
    const currentTask = taskState.tasks.find((task: any) => task.status === 'in_progress');
    if (!currentTask) {
      throw new Error('No current task in progress');
    }

    // Skip if this is a mutation task
    if (currentTask.type === 'mutation') {
      logEvent('info', AgentType.QUERY, 'skipping_mutation_task', {
        taskId: currentTask.id,
        reason: 'Task is mutation type, should be handled by mutation agent'
      });
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: { messages: state.messages }
      });
    }

    // Get selected query with skip settings
    const selectedQuery = state.memory?.get('selectedQuery');
    const skipSettings: SkipSettings = selectedQuery?.skipSettings || {};

    logEvent('info', AgentType.QUERY, 'starting_workflow', {
      taskId: currentTask.id,
      description: currentTask.description,
      type: currentTask.type,
      skipSettings
    });

    let workingState = state;

    // STEP 1: Query Discovery
    if (!skipSettings.skipDiscovery && !workingState.memory?.get('discoveredQueries')) {
      logEvent('info', AgentType.QUERY, 'step_1_discovery');
      await queryDiscoveryNode(workingState, config);
    } else {
      logEvent('info', AgentType.QUERY, 'step_1_skipped', { 
        reason: skipSettings.skipDiscovery ? 'skipDiscovery flag set' : 'queries already cached' 
      });
    }

    // STEP 2: Intent Matching
    if (!skipSettings.skipIntentMatching) {
      logEvent('info', AgentType.QUERY, 'step_2_intent_matching');
      await intentMatchingNode(workingState, config);
    } else {
      logEvent('info', AgentType.QUERY, 'step_2_skipped', { reason: 'skipIntentMatching flag set' });
    }

    // STEP 3: Type Discovery
    if (!skipSettings.skipTypeDiscovery) {
      logEvent('info', AgentType.QUERY, 'step_3_type_discovery');
      await typeDiscoveryNode(workingState, config);
    } else {
      logEvent('info', AgentType.QUERY, 'step_3_skipped', { reason: 'skipTypeDiscovery flag set' });
    }

    // STEP 4: Type Processing
    if (!skipSettings.skipTypeProcessing) {
      logEvent('info', AgentType.QUERY, 'step_4_type_processing');
      await typeProcessingNode(workingState, config);
    } else {
      logEvent('info', AgentType.QUERY, 'step_4_skipped', { reason: 'skipTypeProcessing flag set' });
    }

    // STEP 5: Query Execution (Required)
    logEvent('info', AgentType.QUERY, 'step_5_execution');
    const executionResult = await queryExecutionNode(workingState, config);
    const result = (executionResult.update as any)?.memory?.get('queryResult');

    // Update task result in state
    const updatedState = updateTaskResultInState(workingState, currentTask.id, result);

    logEvent('info', AgentType.QUERY, 'workflow_completed', {
      taskId: currentTask.id,
      selectedQuery: result?.selectedQuery,
      success: result?.success,
      duration: Date.now() - startTime,
      stepsSkipped: Object.entries(skipSettings)
        .filter(([_, value]) => value)
        .map(([key]) => key)
    });

    // Format user message
    const userMessage = result?.success && result?.summary ? 
                       result.summary : 
                       `❌ Error: ${result?.error || 'Unknown error occurred'}`;

    return new Command({
      goto: AgentType.SUPERVISOR,
      update: { 
        messages: [
          ...state.messages,
          new AIMessage({
            content: userMessage
          })
        ],
        memory: updatedState.memory
      }
    });

  } catch (error) {
    logEvent('error', AgentType.QUERY, 'workflow_error', { 
      error: error.message,
      duration: Date.now() - startTime
    });
    
    // Get current task for error handling
    const taskState = state.memory?.get('taskState');
    const currentTask = taskState?.tasks?.find((task: any) => task.status === 'in_progress');
    
    if (currentTask) {
      const errorResult = {
        success: false,
        error: error.message,
        data: { summary: `Query workflow failed: ${error.message}` }
      };
      
      const updatedState = updateTaskResultInState(state, currentTask.id, errorResult);
      
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: { 
          messages: [
            ...state.messages,
            new AIMessage({
              content: `❌ Error: ${error.message}`
            })
          ],
          memory: updatedState.memory
        }
      });
    } else {
      return new Command({
        goto: AgentType.SUPERVISOR,
        update: { 
          messages: [
            ...state.messages,
            new AIMessage({
              content: `❌ Workflow Error: ${error.message}`
            })
          ]
        }
      });
    }
  }
};
