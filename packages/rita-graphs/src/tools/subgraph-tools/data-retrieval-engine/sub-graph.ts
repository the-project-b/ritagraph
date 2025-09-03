import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ToolInterface } from "../../../graphs/shared-types/node-types";
import { BASE_MODEL_CONFIG } from "../../../graphs/model-config";

type Params = {
  tools: Array<ToolInterface>;
};

export function buildDataRetrievalEngineGraph({ tools }: Params) {
  const llm = new ChatOpenAI({ temperature: 0, ...BASE_MODEL_CONFIG });

  // Initialize memory to persist state between graph runs
  const agentCheckpointer = new MemorySaver();
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: agentCheckpointer,
  });

  return agent;
}
