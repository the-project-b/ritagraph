import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ToolInterface } from "@langchain/core/tools";
import { BASE_MODEL_CONFIG } from "../../../graphs/model-config.js";

type Params = {
  tools: Array<ToolInterface>;
};

/**
 * Builds a React agent graph for processing data change proposal corrections.
 * Uses the same React pattern as the data-change-engine for consistency.
 *
 * @param tools - Array of LangChain tools available to the agent
 * @returns Configured React agent with memory persistence
 */
export function buildDataCorrectionEngineGraph({ tools }: Params) {
  const llm = new ChatOpenAI({ temperature: 0, ...BASE_MODEL_CONFIG });

  const agentCheckpointer = new MemorySaver();
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: agentCheckpointer,
  });

  return agent;
}
