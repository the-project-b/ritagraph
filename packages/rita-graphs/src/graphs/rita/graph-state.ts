import { z } from "zod";
import { Runnable } from "@langchain/core/runnables";
import { Annotation, Command } from "@langchain/langgraph";
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

export type Node<State = GraphStateType> = (
  state: State,
  config: typeof ConfigurableAnnotation.State
) => Promise<NodeReturn<State>> | NodeReturn<State>;

export type ToolDefinition<InputSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  parameters: InputSchema;
  execute: (args: z.infer<InputSchema>) => Promise<string> | string;
};

export type AgentNode<
  TInput = any,
  TOutput = any,
  TTools extends ToolDefinition[] = ToolDefinition[]
> = Runnable<TInput, TOutput> & {
  displayName: string;
  config: {
    tools: TTools;
  };
};
