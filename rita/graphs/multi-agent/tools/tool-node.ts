import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { END, Command } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ExtendedState } from "../../../states/states";
import { AgentType } from "../types/agents";
import { logEvent } from "../agents/supervisor-agent";
import { createSupervisorTools } from "../agents/supervisor-agent";
import { getCurrentTask } from "../tasks/tasks-handling";

/**
 * Safe tool execution with error handling and logging
 */
const executeTools = async (tools: any[], state: ExtendedState, agentName: AgentType) => {
  const start = Date.now();
  const toolNode = new ToolNode(tools);

  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls = (lastMessage as any)?.tool_calls || [];

  logEvent("info", agentName, "toolnode_invoke_start", {
    toolCalls: toolCalls.map(call => ({ name: call.name, args: call.args })),
  });

  try {
    const result = await toolNode.invoke(state);

    logEvent("info", agentName, "toolnode_invoke_success", {
      duration: Date.now() - start,
      results: result.messages.map(msg => ({
        type: msg.constructor.name,
        name: (msg as ToolMessage).name,
        content: msg.content
      }))
    });

    return result;
  } catch (error: any) {
    logEvent("error", agentName, "toolnode_invoke_error", {
      duration: Date.now() - start,
      error: error?.message || error
    });

    // Return a synthetic error message so downstream agents can see the failure
    return {
      messages: [
        new ToolMessage({
          name: "tool_error",
          content: `ToolNode execution failed: ${error?.message || "Unknown error"}`,
          tool_call_id: toolCalls[0]?.id || "error_tool_call"
        })
      ],
      state
    };
  }
};

/**
 * Tool node for the multi-agent workflow.
 * Handles tool execution and routing based on tool calls.
 */
export const createToolNode = () => {
  return async (state: ExtendedState, config: any) => {
    const startTime = Date.now();
    logEvent('info', AgentType.TOOL, 'flow_start', { startTime });
    
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (!lastMessage?.tool_calls?.length) {
      logEvent('info', AgentType.TOOL, 'no_tool_calls', {
        messageType: lastMessage?.constructor.name,
        hasToolCalls: !!lastMessage?.tool_calls,
        messageContent: lastMessage?.content
      });
      return new Command({
        goto: END,
        update: { messages: state.messages }
      });
    }

    // Get all supervisor tools including get_next_task
    const supervisorTools = createSupervisorTools();
    
    logEvent('info', AgentType.TOOL, 'executing_tools', {
      toolCalls: lastMessage.tool_calls.map(call => ({
        name: call.name,
        args: call.args
      }))
    });
    
    // Execute tools
    const result = await executeTools(supervisorTools, state, AgentType.TOOL);
    
    logEvent('info', AgentType.TOOL, 'tools_executed', {
      results: result.messages.map(msg => ({
        type: msg.constructor.name,
        content: msg.content,
        name: (msg as ToolMessage).name
      }))
    });
    
    // Get the first tool call for routing
    const firstToolCall = lastMessage.tool_calls[0];
    
    // Handle routing based on tool call type
    let nextNode;
    if (firstToolCall.name === 'get_next_task') {
      // If get_next_task was called, return to supervisor to handle the selection
      nextNode = AgentType.SUPERVISOR;
    } else {
      // For transfer tools, get current task and route accordingly
      const task = getCurrentTask(state);
      if (task) {
        if (task.type === 'query') {
          nextNode = "QUERY_DISCOVERY"; // Start the query workflow
        } else if (task.type === 'mutation') {
          nextNode = AgentType.MUTATION;
        } else if (task.type === 'type_details') {
          nextNode = AgentType.TYPE_DETAILS;
        } else {
          nextNode = "QUERY_DISCOVERY"; // Default fallback to query workflow
        }
      } else {
        nextNode = AgentType.SUPERVISOR; // No current task, let supervisor handle
      }
    }
    
    logEvent('info', AgentType.TOOL, 'preparing_handoff', { 
      targetAgent: nextNode,
      toolCall: {
        name: firstToolCall.name,
        args: firstToolCall.args
      }
    });

    logEvent('info', AgentType.TOOL, 'flow_end', {
      duration: Date.now() - startTime,
      nextNode,
      messagesProcessed: result.messages.length
    });

    return new Command({
      goto: nextNode,
      update: { 
        messages: state.messages.concat(result.messages),
        memory: state.memory
      }
    });
  };
};

/**
 * Create a configured tool node instance
 */
export const toolNode = createToolNode(); 