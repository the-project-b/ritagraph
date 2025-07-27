import { ToolInterface } from "@langchain/core/tools";

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
  ctx: ToolContext<T>
) => ToolInterface<any>;

/**
 * Gives us the ability to create tools with special contexts
 */
export function toolFactory<T>({
  toolDefintions,
  ctx,
}: Params<T>): Array<ToolInterface> {
  return toolDefintions.map((toolDefinition) => toolDefinition(ctx));
}
