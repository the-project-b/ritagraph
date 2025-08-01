import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ToolInterface } from "@langchain/core/tools";

type Params = {
  tools: Array<ToolInterface>;
};

export function buildDataChangeEngineGraph({ tools }: Params) {
  const llm = new ChatOpenAI({ temperature: 0 });

  // Initialize memory to persist state between graph runs
  const agentCheckpointer = new MemorySaver();
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: agentCheckpointer,
  });

  return agent;
}
