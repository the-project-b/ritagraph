/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/// <reference types="node" />
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';

// Import the text files directly
import mcpFirstStepContent from '../prompts/hardcoded/mcp-first-step.ts';
// import mcpEffectivenessContent from '../prompts/hardcoded/mcp-effectiveness.ts';
import mcpInstructionsContent from '../prompts/hardcoded/mcp-instructions.ts';
import mcpWorkingExamplesContent from '../prompts/hardcoded/mcp-working-examples.ts';

import client from '../mcp/client.js';
import { humanReviewNode } from '../nodes/humanReviewNode.js';
import { MergedAnnotation } from '../states/states.js';

const create_rita_v2_graph = async () => {
  try {
    console.log('Initializing MCP client...');

    // Get the tools (flattened array is the default now)
    const mcpTools = await client.getTools();

    if (mcpTools.length === 0) {
      throw new Error('No tools found');
    }

    console.log(
      `Loaded ${mcpTools.length} MCP tools: ${mcpTools
        .map((tool) => tool.name)
        .join(', ')}`
    );

    const anthropicChadModel = new ChatAnthropic({
      model: "claude-opus-4-20250514",
      temperature: 0,
      maxTokens: undefined,
      maxRetries: 2,
    }).bindTools(mcpTools);

    // const cheapModel = new ChatOpenAI({
    //   model: 'gpt-3.5-turbo',
    //   temperature: 0,
    // }).bindTools(mcpTools);

    // const expensiveModel = new ChatOpenAI({
    //   model: 'gpt-4o',
    //   temperature: 0,
    // }).bindTools(mcpTools);

    // const toolNode = new ToolNode(mcpTools); // below is custom implementation of the same thing. 
    const toolNode = async (state: typeof MergedAnnotation.State, config: any) => {
      // Access the authenticated user and token from config (try all possible locations)
      const user = config?.user || config?.langgraph_auth_user || (config?.configurable && config.configurable.langgraph_auth_user);
      const accessToken = user?.token;

      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      if (!lastMessage || !lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return { messages: [] };
      }

      const toolMessages: ToolMessage[] = [];

      for (const toolCall of lastMessage.tool_calls) {
        const tool = mcpTools.find(t => t.name === toolCall.name);
        let toolResult = '';
        if (tool) {
          const toolArgs = { ...toolCall.args, accessToken: accessToken };
          try {
            const result = await tool.invoke(toolArgs);
            toolResult = typeof result === 'string' ? result : JSON.stringify(result);
          } catch (e: any) {
            console.error(`Error invoking tool ${toolCall.name}:`, e);
            toolResult = `Error: ${e.message || JSON.stringify(e)}`;
          }
        } else {
          toolResult = 'Tool not found.';
        }
        if (toolCall.id) {
          toolMessages.push(new ToolMessage({
            content: toolResult,
            name: toolCall.name,
            tool_call_id: toolCall.id,
          }));
        } else {
          console.warn(`Tool call for ${toolCall.name} is missing an ID. Skipping.`);
        }
      }
      return { messages: toolMessages };
    };

    // Define the function that calls the model
    const llmNode = async (state: typeof MergedAnnotation.State, config: any) => {
      // Access the authenticated user and token from config (try all possible locations)
      const user = config?.user || config?.langgraph_auth_user || (config?.configurable && config.configurable.langgraph_auth_user);
      const accessToken = user?.token;
      console.log('Authenticated user:', user);
      console.log('Access token:', accessToken);

      const lastMsg = state.messages[state.messages.length - 1];
      const userMessage = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
      const useExpensive = userMessage.length > 200 || userMessage.includes('complex');
      
      // Create multiple system messages instead of just one
      const mcpFirstStepSystemMessage = { role: "system", content: mcpFirstStepContent };
      // const mcpEffectivenessSystemMessage = { role: "system", content: mcpEffectivenessContent };
      const mcpInstructionsSystemMessage = { role: "system", content: mcpInstructionsContent };
      const mcpWorkingExamplesSystemMessage = { role: "system", content: mcpWorkingExamplesContent };
      
      // Include all system messages
      const messages = [
        mcpFirstStepSystemMessage,
        // mcpEffectivenessSystemMessage, 
        mcpInstructionsSystemMessage, 
        mcpWorkingExamplesSystemMessage,
        ...state.messages
      ];
      
      // let response = await (useExpensive ? expensiveModel : cheapModel).invoke(messages);
      let response = await anthropicChadModel.invoke(messages);

      // Fallback: if no tool call, try expensive model
      if (!response.tool_calls || response.tool_calls.length === 0) {
        response = await anthropicChadModel.invoke(messages);
      }
      return { messages: [response] };
    };

    // const llmNodeExpensive = async (state: typeof MergedAnnotation.State, config: any) => {
    //   // Access the authenticated user and token from config (try all possible locations)
    //   const user = config?.user || config?.langgraph_auth_user || (config?.configurable && config.configurable.langgraph_auth_user);
    //   const accessToken = user?.token;
    //   console.log('Authenticated user:', user);
    //   console.log('Access token:', accessToken);

    //   const lastMsg = state.messages[state.messages.length - 1];
    //   const userMessage = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
    //   const useExpensive = userMessage.length > 200 || userMessage.includes('complex');
    //   const systemMessage = { role: "system", content: systemPrompt };
    //   const messages = [systemMessage, ...state.messages];
    //   // let response = await (useExpensive ? expensiveModel : cheapModel).invoke(messages);
    //   let response = await expensiveModel.invoke(messages);

    //   // Fallback: if no tool call, try expensive model
    //   if (!response.tool_calls || response.tool_calls.length === 0) {
    //     response = await expensiveModel.invoke(messages);
    //   }
    //   // Return a flag if tool calls are present
    //   return { messages: [response], needs_tool_call: !!response.tool_calls?.length };
    // };

    const routeAfterLLM = (
      state: typeof MergedAnnotation.State
    ): typeof END | 'human_review_node' | 'tool_node' => {
      const lastMessage = state.messages[
        state.messages.length - 1
      ] as AIMessage;
      
      if (!lastMessage.tool_calls?.length) {
        return END;
      }

      // Check if any tool call requires approval (contains 'with-approval')
      const requiresApproval = lastMessage.tool_calls.some(toolCall => 
        toolCall.name.includes('with-approval')
      );

      if (requiresApproval) {
        return 'human_review_node';
      } else {
        // Skip human review for tools that don't need approval
        return 'tool_node';
      }
    };


    const workflow = new StateGraph(MergedAnnotation)
      .addNode('llm_node', llmNode)
      .addNode('tool_node', toolNode)
      .addNode('human_review_node', humanReviewNode, {
        ends: ['tool_node', 'llm_node'],
      })
      .addEdge(START, 'llm_node')
      .addConditionalEdges('llm_node', routeAfterLLM, ['human_review_node', 'tool_node', END])
      .addEdge('tool_node', 'llm_node');

    // Compile the graph
    const memory = new MemorySaver();
    const graph = workflow.compile({ checkpointer: memory });

    graph.name = 'Rita V2';

    return graph;
  } catch (error) {
    console.error('Error:', error);
    process.exit(1); // Exit with error code
  }
};

export { create_rita_v2_graph };
