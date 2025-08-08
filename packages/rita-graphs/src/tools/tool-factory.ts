import { ToolInterface } from "@langchain/core/tools";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({ module: "Tools", tool: "tool_factory" });

export type ToolContext<T = undefined> = {
  accessToken: string;
  selectedCompanyId: string;
  extendedContext?: T;
};

type Params<T> = {
  toolDefintions: Array<ToolFactoryToolDefintion<any>>;
  ctx: ToolContext<T>;
};

export type ToolFactoryToolDefintion<T = any> = (
  ctx: ToolContext<T>,
) => ToolInterface<any>;

/**
 * Gives us the ability to create tools with special contexts
 */
export function toolFactory<T>({
  toolDefintions,
  ctx,
}: Params<T>): Array<ToolInterface> {
  const tools = toolDefintions.map((toolDefinition) => toolDefinition(ctx));
  logger.debug("[TOOL FACTORY] Initialized tools", {
    operation: "tool_factory_initialization",
    toolNames: tools.map((i) => i.name),
  });

  return tools;
}
