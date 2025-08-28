import { z } from "zod";
import { Runnable } from "@langchain/core/runnables";
import {
  Annotation,
  Command,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import {
  AnnotationWithDefault,
  BaseGraphAnnotation,
} from "../shared-types/base-annotation.js";

export const ConfigurableAnnotation = Annotation.Root({
  // Used for development purposes, to debug in the graph UI
  backupAccessToken: AnnotationWithDefault<string | undefined>(undefined),
  backupCompanyId: AnnotationWithDefault<string | undefined>(undefined),
});

export const GraphState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  workflowEngineResponseDraft: Annotation<string | undefined>(),
  draftedResponse: Annotation<string | undefined>(),
});

export type GraphStateType = typeof GraphState.State;

type NodeReturn<State = GraphStateType> = Command | Partial<State> | null;

export function getContextFromConfig(
  config: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
): typeof ConfigurableAnnotation.State {
  // for some reason config does not populate context correctly
  const context = config as typeof ConfigurableAnnotation.State;

  return context;
}

// LangGraph passes a RunnableConfig that includes our custom config
export type Node<State = GraphStateType> = (
  state: State,
  config?: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
  getAuthUser?: (
    config: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
  ) => any,
) => Promise<NodeReturn<State>> | NodeReturn<State>;

export type EdgeDecision<State = GraphStateType> = (
  state: State,
  config: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
  getAuthUser?: (
    config: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
  ) => any,
) => Promise<string | Array<string>> | string | Array<string>;

export type ToolDefinition<InputSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  parameters: InputSchema;
  execute: (args: z.infer<InputSchema>) => Promise<string> | string;
};

// There is a type issue in langgraph that we need to work around
export type AssumedConfigType = {
  thread_id: string;
  run_id: string;
};

export type AgentNode<
  TInput = any,
  TOutput = any,
  TTools extends ToolDefinition[] = ToolDefinition[],
> = Runnable<TInput, TOutput> & {
  displayName: string;
  config: {
    tools: TTools;
  };
};
