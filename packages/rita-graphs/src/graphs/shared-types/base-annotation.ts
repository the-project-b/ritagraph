import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { QueryDefinition } from "../../utils/types/query-defintion";
import { DataRepresentationLayerEntity } from "../../utils/data-representation-layer";

export function AnnotationWithDefault<T>(defaultValue: T) {
  return Annotation<T>({
    value: (currentValue: T, update?: T) => update || currentValue,
    default: () => defaultValue,
  });
}

export type DataChangeProposal = {
  id: string;
  createdAt: string;
  // E.g.: "Change salary for x from 1000 -> 1500"
  description: string;

  relatedUserId?: string;
  status: "approved" | "pending" | "rejected";
} & (
  | {
      changeType: "change";
      statusQuoQuery: QueryDefinition; //Not defined for creation
      mutationQuery: QueryDefinition;
      dynamicMutationVariables?: Record<string, QueryDefinition>;
      changedField: string; // payment.properties.amount -> this key will be replaced in the FE for translation
      previousValueAtApproval?: string;
      newValue: string;
    }
  | {
      changeType: "creation";
      mutationQuery: QueryDefinition;
      properties: Record<string, string>;
    }
);

export const BaseGraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  preferredLanguage: AnnotationWithDefault<"EN" | "DE">("DE"),
  /**
   * The company id, is the id of the HR manager / the one that the HR manage is currently using (in case he manages multiple companies).
   * Similiar system should work for BPOs however there it could be a range of companies that the BPO is managing at the same time.
   * We need to find a definitive way to handle this.
   */
  selectedCompanyId: Annotation<string | undefined>(),
  draftedResponse: Annotation<string | undefined>(),
  routingDecision: Annotation<
    "CASUAL_RESPONSE_WITHOUT_DATA" | "WORKFLOW_ENGINE" | undefined
  >(),
  dataRepresentationLayerStorage: AnnotationWithDefault<
    Record<string, DataRepresentationLayerEntity>
  >({}),
});
