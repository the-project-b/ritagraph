import { Annotation, Command, MessagesAnnotation } from "@langchain/langgraph";

export const ConfigurableAnnotation = Annotation.Root({});

export const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
});

export type Node = (
  state: typeof GraphState.State,
  config: typeof ConfigurableAnnotation.State
) => Promise<Command>;
