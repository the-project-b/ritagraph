import { z } from "zod";
import { Runnable } from "@langchain/core/runnables";
import { Annotation, Command, MessagesAnnotation } from "@langchain/langgraph";

function AnnotationWithDefault<T>(defaultValue: T) {
  return Annotation<T>({
    value: (currentValue: T, update?: T) => update || currentValue,
    default: () => defaultValue,
  });
}

export const ConfigurableAnnotation = Annotation.Root({
  userLocale: AnnotationWithDefault<"en" | "de">("de"),
});

export const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  taskDescriptions: Annotation<string[] | undefined>({
    reducer: (existing, updated) => {
      if (!updated) return existing;
      return [...existing, ...updated];
    },
    default: () => [],
  }),
  workflowEngineResponseDraft: Annotation<string | undefined>(),
  draftedResponse: Annotation<string | undefined>(),
  routingDecision: Annotation<
    "CASUAL_RESPONSE_WITHOUT_DATA" | "WORKFLOW_ENGINE" | undefined
  >(),
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
