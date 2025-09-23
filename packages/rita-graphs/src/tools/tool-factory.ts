import { ToolInterface } from "@langchain/core/tools";
import { createLogger } from "@the-project-b/logging";
import AgentActionLogger from "../utils/agent-action-logger/AgentActionLogger";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "tool_factory",
});

export type ToolContext<T = undefined> = {
  accessToken: string;
  selectedCompanyId: string;
  agentActionLogger: AgentActionLogger;
  appdataHeader?: string; // Optional appdata header for impersonation context
  extendedContext?: T;
};

type Params<T> = {
  toolDefinitions: Array<ToolFactoryToolDefintion<any>>;
  ctx: ToolContext<T>;
};

export type ToolFactoryToolDefintion<T = any> = (
  ctx: ToolContext<T>,
) => ToolInterface<any>;

/**
 * Gives us the ability to create tools with special contexts
 */
export function toolFactory<T>({
  toolDefinitions,
  ctx,
}: Params<T>): Array<ToolInterface> {
  const tools = toolDefinitions.map((toolDefinition) => toolDefinition(ctx));
  logger.debug("[TOOL FACTORY] Initialized tools", {
    operation: "tool_factory_initialization",
    toolNames: tools.map((i) => i.name),
  });

  return tools;
}
