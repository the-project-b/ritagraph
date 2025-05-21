/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/// <reference types="node" />
import { AIMessage } from '@langchain/core/messages';
import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';

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

    const model = new ChatOpenAI({
      model: 'gpt-4-turbo-preview',
      temperature: 0,
    }).bindTools(mcpTools);

    const toolNode = new ToolNode(mcpTools);

    // Define the function that calls the model
    const llmNode = async (state: typeof MergedAnnotation.State) => {
      const response = await model.invoke(state.messages);
      return { messages: [response] };
    };

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

    // Create a new graph with MessagesAnnotation
    const workflow = new StateGraph(MergedAnnotation)
      .addNode('llm_node', llmNode)
      .addNode('tool_node', toolNode)
      .addNode('human_review_node', humanReviewNode, {
        ends: ['tool_node', 'llm_node'],
      })
      .addEdge(START, 'llm_node')
      .addConditionalEdges('llm_node', routeAfterLLM, [
        'human_review_node',
        END,
      ])
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
