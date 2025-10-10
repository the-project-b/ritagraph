import { RunnableToolLike } from "@langchain/core/runnables";
import { DynamicTool, StructuredToolInterface } from "@langchain/core/tools";
import { AnnotationRoot, Command } from "@langchain/langgraph";
import AgentActionLogger from "../../utils/agent-action-logger/AgentActionLogger";

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

export type FetchToolsFunction = (
  companyId: string,
  config: AnnotationRoot<any>,
  agentActionLogger: AgentActionLogger,
  rolesRitaShouldBeVisibleTo: Array<number> | null,
) => Promise<Array<ToolInterface>>;
