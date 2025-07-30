import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { QueryDefinition } from "../../utils/types/query-defintion";

export function AnnotationWithDefault<T>(defaultValue: T) {
  return Annotation<T>({
    value: (currentValue: T, update?: T) => update || currentValue,
    default: () => defaultValue,
  });
}

export type DataChangeProposal = {
  createdAt: string;
  // E.g.: "Change salary for x from 1000 -> 1500"
  description: string;
  id: string;

  statusQuoQuery: QueryDefinition;
  mutationQuery: QueryDefinition;
  relatedUserId?: string;
  status: "approved" | "pending" | "rejected";

  // Bound to change
  changedField: string;
  previousValueAtApproval?: string;
  newValue: string;
};

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
});
