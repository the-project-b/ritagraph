import { MergedAnnotation } from "../states/states";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

export interface PlaceholderContext {
  state: typeof MergedAnnotation.State;
  config: LangGraphRunnableConfig<any>;
}

export interface PlaceholderResolver {
  name: string;
  resolve: (context: PlaceholderContext) => Promise<string> | string;
}

export interface PlaceholderRegistry {
  [key: string]: PlaceholderResolver;
}
