import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { Command } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import client from "../../mcp/client.js";
import { placeholderManager } from "../../placeholders/manager";

import { MergedAnnotation, ExtendedState } from "../../states/states";
import { TaskState } from './types';
import { AgentType } from './types/agents';
import {
  updateTaskResultInState,
  executeQueryTask,
  executeMutationTask,
  executeTypeDetailsTask,
  injectTypeDetailsTaskIfNeeded
} from './tasks/tasks-handling';
import {
  supervisorAgent,
  logEvent,
} from './agents/supervisor-agent';
import { toolNode } from "./tools/tool-node";
import { 
  queryDiscoveryNode, 
  intentMatchingNode, 
  queryExecutionNode,
  typeDiscoveryNode,
  typeProcessingNode 
} from "./nodes";

// Tool node is now imported from ./tools/tool-node

const create_multi_agent_rita_graph = async () => {
  try {
    console.log("Initializing Multi-Agent RITA Graph...");

    // Create the nodes
    const workflow = new StateGraph(MergedAnnotation)
      .addNode(AgentType.SUPERVISOR, supervisorAgent, {
        ends: [AgentType.TOOL, END]
      })
      .addNode(AgentType.TOOL, toolNode, {
        ends: ["QUERY_DISCOVERY", AgentType.MUTATION, AgentType.TYPE_DETAILS, END]
      })
      .addNode("QUERY_DISCOVERY", queryDiscoveryNode, {
        ends: ["INTENT_MATCHING"]
      })
      .addNode("INTENT_MATCHING", intentMatchingNode, {
        ends: ["TYPE_DISCOVERY"]  
      })
      .addNode("TYPE_DISCOVERY", typeDiscoveryNode, {
        ends: ["TYPE_PROCESSING"]
      })
      .addNode("TYPE_PROCESSING", typeProcessingNode, {
        ends: ["QUERY_EXECUTION"]
      })
      .addNode("QUERY_EXECUTION", queryExecutionNode, {
        ends: [AgentType.SUPERVISOR]
      })
      .addNode(AgentType.MUTATION, async (state: ExtendedState) => {
        const startTime = Date.now();
        logEvent('info', AgentType.MUTATION, 'flow_start', { startTime });

        // Get the current task from task state
        const taskState = state.memory?.get('taskState') as TaskState;
        if (!taskState) {
          logEvent('info', AgentType.MUTATION, 'no_task_state');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Find the current task in progress
        const currentTask = taskState.tasks.find(task => task.status === 'in_progress');
        
        if (!currentTask) {
          logEvent('info', AgentType.MUTATION, 'no_current_task');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Skip if this is a query task
        if (currentTask.type === 'query') {
          logEvent('info', AgentType.MUTATION, 'skipping_task', {
            taskId: currentTask.id,
            description: currentTask.description,
            reason: 'Task is query type, should be handled by query agent'
          });
          return new Command({
            goto: AgentType.SUPERVISOR,
            update: { messages: state.messages }
          });
        }

        logEvent('info', AgentType.MUTATION, 'executing_task', {
          taskId: currentTask.id,
          description: currentTask.description,
          type: currentTask.type
        });

        // Execute mutation task
        const result = await executeMutationTask(currentTask);
        
        // Update task result and get new state
        const updatedState = updateTaskResultInState(state, currentTask.id, result);
        
        logEvent('info', AgentType.MUTATION, 'task_completed', {
          taskId: currentTask.id,
          result
        });

        logEvent('info', AgentType.MUTATION, 'flow_end', {
          duration: Date.now() - startTime
        });

        // Format clean, user-friendly message from the result  
        let userMessage = '';
        
        if ((result as any).success) {
          userMessage = `✅ Operation completed successfully`;
          if ((result as any).data && typeof (result as any).data === 'string') {
            userMessage = `✅ ${(result as any).data}`;
          }
        } else {
          userMessage = `❌ Error: ${(result as any).error || 'Unknown error occurred'}`;
        }

        // Return to supervisor for next task
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
      })
      .addNode(AgentType.TYPE_DETAILS, async (state: ExtendedState, config: any) => {
        const startTime = Date.now();
        logEvent('info', AgentType.TYPE_DETAILS, 'flow_start', { startTime });

        // Get the current task from task state
        const taskState = state.memory?.get('taskState') as TaskState;
        if (!taskState) {
          logEvent('info', AgentType.TYPE_DETAILS, 'no_task_state');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Find the current task in progress
        const currentTask = taskState.tasks.find(task => task.status === 'in_progress');
        
        if (!currentTask) {
          logEvent('info', AgentType.TYPE_DETAILS, 'no_current_task');
          return new Command({
            goto: END,
            update: { messages: state.messages }
          });
        }

        // Skip if this is not a type details task
        if (currentTask.type !== 'type_details') {
          logEvent('info', AgentType.TYPE_DETAILS, 'skipping_task', {
            taskId: currentTask.id,
            description: currentTask.description,
            reason: 'Task is not type_details type'
          });
          return new Command({
            goto: AgentType.SUPERVISOR,
            update: { messages: state.messages }
          });
        }

        logEvent('info', AgentType.TYPE_DETAILS, 'executing_task', {
          taskId: currentTask.id,
          description: currentTask.description,
          type: currentTask.type
        });

        // Execute type details task
        const result = await executeTypeDetailsTask(currentTask, state, config);
        
        // Update task result and get new state
        const updatedState = updateTaskResultInState(state, currentTask.id, result);
        
        logEvent('info', AgentType.TYPE_DETAILS, 'task_completed', {
          taskId: currentTask.id,
          result
        });

        logEvent('info', AgentType.TYPE_DETAILS, 'flow_end', {
          duration: Date.now() - startTime
        });

        // Type details tasks are internal - don't show detailed messages to user
        let userMessage = '';
        
        // Only show error messages for type details tasks
        if (!(result as any).success) {
          userMessage = `❌ Error analyzing data types: ${(result as any).error || 'Unknown error occurred'}`;
        }
        // For successful type details, don't show any message - it's internal

        // Return to supervisor for next task
        return new Command({
          goto: AgentType.SUPERVISOR,
          update: { 
            messages: userMessage ? [
              ...state.messages,
              new AIMessage({
                content: userMessage
              })
            ] : state.messages, // Only add message if there's an error
            memory: updatedState.memory
          }
        });
      })
      .addEdge(START, AgentType.SUPERVISOR);
      // Note: Removed unconditional edges from TOOL node - routing is handled by Command.goto

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({ 
      checkpointer: memory
    });

    graph.name = "Supervisor Agent";

    return graph;
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

// All query logic is now in dedicated nodes under ./nodes/

export { create_multi_agent_rita_graph }; 