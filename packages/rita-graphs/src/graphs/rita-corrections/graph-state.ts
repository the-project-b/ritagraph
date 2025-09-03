import { Annotation, type LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  AnnotationWithDefault,
  BaseGraphAnnotation,
  DataChangeProposal,
} from "../shared-types/base-annotation.js";
import { CorrectionStatus } from "./types.js";

export const ConfigurableAnnotation = Annotation.Root({});

export const GraphState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  originalProposalId: Annotation<string>(),
  originalProposal: Annotation<DataChangeProposal | undefined>(),
  correctionRequest: Annotation<string>(),
  correctedProposal: Annotation<DataChangeProposal | undefined>(),
  correctionStatus: AnnotationWithDefault<CorrectionStatus>(
    CorrectionStatus.PENDING,
  ),
  correctionResponseDraft: Annotation<string | undefined>(),
});

export type GraphStateType = typeof GraphState.State;

export type Node<State = GraphStateType> = (
  state: State,
  config?: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
  getAuthUser?: (
    config: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
  ) => any,
) => Promise<Partial<State> | null> | Partial<State> | null;

export type AssumedConfigType = {
  thread_id: string;
  run_id: string;
};
