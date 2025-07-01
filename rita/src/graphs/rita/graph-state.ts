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
  // Used for development purposes, to debug in the graph UI
  backupAccessToken: AnnotationWithDefault<string | undefined>(undefined),
  backupCompanyId: AnnotationWithDefault<string | undefined>(undefined),
});

export const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  /**
   * The company id, is the id of the HR manager / the one that the HR manage is currently using (in case he manages multiple companies).
   * Similiar system should work for BPOs however there it could be a range of companies that the BPO is managing at the same time.
   * We need to find a definitive way to handle this.
   *
   * NOTE: This field is actually part of the interface for the frontend - change with caution
   */
  selectedCompanyId: Annotation<string | undefined>(),

  preferredLanguage: AnnotationWithDefault<"EN" | "DE">("DE"),
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
