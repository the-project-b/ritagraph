/* eslint-disable @typescript-eslint/no-non-null-assertion */
/// <reference types="node" />
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { StructuredTool } from '@langchain/core/tools';

import { humanReviewNode } from '../nodes/humanReviewNode.js';
import { MergedAnnotation } from '../states/states.js';
import { weatherSearch } from '../tools/weatherSearch.js';
import { initGraphQLMCPClient } from '../mcp/graphql.mcp.js';

const graphQLMCPClient = await initGraphQLMCPClient(
  process.env.GRAPHQL_MCP_ENDPOINT as string
);

const model = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0,
}).bindTools([weatherSearch, ...graphQLMCPClient]);

const llmNode = async (state: typeof MergedAnnotation.State) => {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
};

// const toolNode = new ToolNode(graphQLMCPClient);

const runTool = async (state: typeof MergedAnnotation.State) => {
  const newMessages: ToolMessage[] = [];
  const tools: Record<string, StructuredTool> = { 
    weather_search: weatherSearch,
    ...graphQLMCPClient.reduce((acc, tool) => ({ ...acc, [tool.name]: tool }), {})
  };
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls!;

  for (const toolCall of toolCalls) {
    const tool = tools[toolCall.name];
    if (!tool) continue;
    
    const result = await tool.invoke(toolCall.args);
    newMessages.push(
      new ToolMessage({
        name: toolCall.name,
        content: String(result),
        tool_call_id: toolCall.id!,
      })
    );
  }
  return { messages: newMessages };
};

const routeAfterLLM = (
  state: typeof MergedAnnotation.State
): typeof END | 'human_review_node' => {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (!lastMessage.tool_calls?.length) {
    return END;
  }
  return 'human_review_node';
};

const workflow = new StateGraph(MergedAnnotation)
  .addNode('llm_node', llmNode)
  .addNode('tool_node', runTool)
  .addNode('human_review_node', humanReviewNode, {
    ends: ['tool_node', 'llm_node'],
  })
  .addEdge(START, 'llm_node')
  .addConditionalEdges('llm_node', routeAfterLLM, ['human_review_node', END])
  .addEdge('tool_node', 'llm_node');

const memory = new MemorySaver();

const graph = workflow.compile({ checkpointer: memory });

graph.name = 'Rita V2';

export { graph };
