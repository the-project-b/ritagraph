import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ToolInterface } from "@langchain/core/tools";
import { BASE_MODEL_CONFIG } from "../../../graphs/model-config";

type Params = {
  tools: Array<ToolInterface>;
};

export function buildDataChangeEngineGraph({ tools }: Params) {
  const llm = new ChatOpenAI({ temperature: 0, ...BASE_MODEL_CONFIG });

  // Filter based on agentLogger

  // Initialize memory to persist state between graph runs
  const agentCheckpointer = new MemorySaver();
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: agentCheckpointer,
  });

  return agent;
}
