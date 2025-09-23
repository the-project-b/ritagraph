import { RunnableToolLike } from "@langchain/core/runnables";
import { DynamicTool, StructuredToolInterface } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";

type NodeReturn<State> = Command | Partial<State> | null;

export type Node<State, Config> = (
  state: State,
  config: Config,
) => Promise<NodeReturn<State>> | NodeReturn<State>;

export type NodeWithAuth<State, Config> = (
  state: State,
  config: Config,
  getAuthUser: (config: any) => any,
) => Promise<NodeReturn<State>> | NodeReturn<State>;

export type ToolInterface =
  | StructuredToolInterface
  | DynamicTool
  | RunnableToolLike;
