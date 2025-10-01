import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { QueryDefinition } from "../../utils/types/query-defintion";
import { DataRepresentationLayerEntity } from "../../utils/data-representation-layer";
import AgentActionLogger, {
  AgentLogEvent,
} from "../../utils/agent-action-logger/AgentActionLogger";
import { AgentTodoItem } from "../rita/nodes/todo-engine/todo-engine";

export function AnnotationWithDefault<T>(defaultValue: T) {
  return Annotation<T>({
    value: (currentValue: T, update?: T) => update || currentValue,
    default: () => defaultValue,
  });
}

export type QueryId =
  | "payment.update"
  | "payment.create"
  | "employee.update"
  | "payment.get"
  | "employee.get";

export type ChangedField =
  | "payment.amount"
  | "payment.monthlyHours"
  | "payment.frequency"
  | "employee.firstName"
  | "employee.lastName"
  | "employee.healthInsurance"
  | "employee.birthName";

export type DataChangeProposal = {
  id: string;
  createdAt: string;
  // E.g.: "Change salary for x from 1000 -> 1500"
  description: string;

  relatedUserId?: string;
  relatedContractId?: string;
  status: "approved" | "pending" | "rejected";
  runId: string; // The runId of the run that created this proposal
  iteration: number; // Defaults to 1, increments with each correction
  previousIterations?: Array<DataChangeProposal>; // Full history of previous proposal versions
  correctionInProgress?: boolean;
} & (
  | {
      changeType: "change";
      statusQuoQuery: QueryDefinition; //Not defined for creation
      mutationQuery: QueryDefinition;
      dynamicMutationVariables?: Record<string, QueryDefinition>;
      changedField: ChangedField; // payment.properties.amount -> this key will be replaced in the FE for translation
      previousValueAtApproval?: string;
      newValue: string;
      quote: string;
    }
  | {
      changeType: "creation";
      mutationQuery: QueryDefinition;
      properties: Record<string, string>;
      quote: string;
    }
);

export const BaseGraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  preferredLanguage: AnnotationWithDefault<"EN" | "DE">("DE"),
  isTriggeredByEmail: AnnotationWithDefault<boolean>(false),
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
  // When the run is finished we can store all the logs in agentActionEvents and a new run then initializes agentActionLogger with the events
  agentActionLogger: AnnotationWithDefault<AgentActionLogger>(
    AgentActionLogger.fromLogs([]),
  ),
  todos: AnnotationWithDefault<Array<AgentTodoItem>>([]),
  agentActionEvents: AnnotationWithDefault<Array<AgentLogEvent>>([]),
  dataRepresentationLayerStorage: AnnotationWithDefault<
    Record<string, DataRepresentationLayerEntity>
  >({}),
});
