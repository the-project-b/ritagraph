/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/// <reference types="node" />
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';

// Import the text files directly
import mcpFirstStepContent from '../prompts/hardcoded/mcp-first-step.ts';
import mcpEffectivenessContent from '../prompts/hardcoded/mcp-effectiveness.ts';
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

    const cheapModel = new ChatOpenAI({
      model: 'gpt-3.5-turbo',
      temperature: 0,
    }).bindTools(mcpTools);

    const expensiveModel = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0,
    }).bindTools(mcpTools);

    // const toolNode = new ToolNode(mcpTools); // below is custom implementation of the same thing. 
    const toolNode = async (state: typeof MergedAnnotation.State, config: any) => {
      // Access the authenticated user and token from config (try all possible locations)
      const user = config?.user || config?.langgraph_auth_user || (config?.configurable && config.configurable.langgraph_auth_user);
      const accessToken = user?.token;
      console.log('Authenticated user:', user);
      console.log('Access token:', accessToken);

      // const accessTempToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IkRUSldkM2xSMmdnTmFWdkxfdF85dyJ9.eyJodHRwczovL29uYm9hcmRpbmcucHJvamVjdC1iLmRldi9hcGkvYXV0aCI6eyJyb2xlcyI6WyJvbmJvYXJkaW5nLWhyLW1hbmFnZXIiXSwiaXNTaWdudXAiOmZhbHNlfSwidXNlclJvbGVzIjpbIm9uYm9hcmRpbmctaHItbWFuYWdlciJdLCJpc3MiOiJodHRwczovL2Rldi1wcm9qZWN0LWIuZXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDY4MjU5MzFkYjBiMGYwYTY2Y2I0ZWYzZiIsImF1ZCI6WyJodHRwczovL3ZlcmlmeS1hdXRoLnByb2plY3QtYi5kZXYvIiwiaHR0cHM6Ly9kZXYtcHJvamVjdC1iLmV1LmF1dGgwLmNvbS91c2VyaW5mbyJdLCJpYXQiOjE3NDc5Mzc3OTksImV4cCI6MTc0ODAyNDE5OSwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCBvZmZsaW5lX2FjY2VzcyIsImd0eSI6InBhc3N3b3JkIiwiYXpwIjoiemtuZDFFYmRaNHJWOUJXU1g5eG5Vd041ODU0TklYMnciLCJwZXJtaXNzaW9ucyI6W119.MdAYR9K3cvjylK11L00E9i0na3FNlLNHp0sDZznUk_Hy9mQZhutBSagDNblLAIu45ISnfFhwGg7HEuGHUJDgBZY_hD_UOsPWw0tkPNe13UqUSvIkjUNvX5hIHpUL0l8VkywFI5HADhrbJfteSyhUgP1yi1q9PxoP3E5sPzHAHGBA6TfVkS1khfustAtILvHtUzsQITmBSsRqCKpFduMY0B_dxk2ZMVcmCGS3eZGkPv9zySA9MMgE5L7mdrD1uaIx8KT7-9Al7MpAPhR5fZSm_Rg3sTf8i-eQqGN5bOrpUh6bApdf2JXEpPg3FFXO7H3E75aNaRXRZmGEpmZ9BdD_tw'

      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      if (!lastMessage || !lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return { messages: [], needs_llm_postprocess: false };
      }

      const toolMessages: ToolMessage[] = [];
      let needsLLMPostprocess = false;

      for (const toolCall of lastMessage.tool_calls) {
        const tool = mcpTools.find(t => t.name === toolCall.name);
        let toolResult = '';
        if (tool) {
          let toolArgs = toolCall.args;
          const toolsRequiringToken = ['mcp__graphql__graphql-execute-query', 'mcp__graphql__graphql-execute-mutation'];
          if (toolsRequiringToken.includes(tool.name)) {
            toolArgs = { ...toolArgs, accessToken: accessToken };
          }
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
        // If any tool call is 'mcp_localhost-sse_hello-world', set the flag.
        // Adjust if your actual "end-triggering" tool has a different name.
        if (toolCall.name === 'mcp_localhost-sse_hello-world') {
          needsLLMPostprocess = true;
        }
      }
      return { messages: toolMessages, needs_llm_postprocess: needsLLMPostprocess };
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
      const mcpEffectivenessSystemMessage = { role: "system", content: mcpEffectivenessContent };
      const mcpInstructionsSystemMessage = { role: "system", content: mcpInstructionsContent };
      const mcpWorkingExamplesSystemMessage = { role: "system", content: mcpWorkingExamplesContent };
      
      // Include all system messages
      const messages = [
        mcpFirstStepSystemMessage,
        mcpEffectivenessSystemMessage, 
        mcpInstructionsSystemMessage, 
        mcpWorkingExamplesSystemMessage,
        ...state.messages
      ];
      
      // let response = await (useExpensive ? expensiveModel : cheapModel).invoke(messages);
      let response = await expensiveModel.invoke(messages);

      // Fallback: if no tool call, try expensive model
      if (!response.tool_calls || response.tool_calls.length === 0) {
        response = await expensiveModel.invoke(messages);
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
    ): typeof END | 'human_review_node' => {
      const lastMessage = state.messages[
        state.messages.length - 1
      ] as AIMessage;
      if (!lastMessage.tool_calls?.length) {
        return END;
      }
      return 'human_review_node';
    };


    const workflow = new StateGraph(MergedAnnotation)
      .addNode('llm_node', llmNode)
      .addNode('tool_node', toolNode)
      .addNode('human_review_node', humanReviewNode, {
        ends: ['tool_node', 'llm_node'],
      })
      .addEdge(START, 'llm_node')
      .addConditionalEdges('llm_node', routeAfterLLM, ['human_review_node', END])
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
