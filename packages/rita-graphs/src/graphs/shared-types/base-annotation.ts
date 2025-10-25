import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

import { QueryDefinition } from "../../utils/types/query-defintion";
import { DataRepresentationLayerEntity } from "../../utils/data-representation-layer";
import AgentActionLogger, {
  AgentLogEvent,
} from "../../utils/agent-action-logger/AgentActionLogger";
import { AgentTodoItem } from "../rita/nodes/todo-engine/todo-engine";
import { BaseMessage } from "@langchain/core/messages";

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
  /**
   * When rita is triggered, it should per default only be visible to the PSP
   * However we want to give control to the backend to decide which roles should be able to see rita.
   * Every thread item related to rita - that is being created - should use this value.
   */
  rolesRitaShouldBeVisibleTo: AnnotationWithDefault<Array<number> | null>(null),
  preferredLanguage: AnnotationWithDefault<"EN" | "DE">("DE"),
  isTriggeredByEmail: AnnotationWithDefault<boolean>(false),
  /**
   * The company id, is the id of the HR manager / the one that the HR manage is currently using (in case he manages multiple companies).
   * Similiar system should work for BPOs however there it could be a range of companies that the BPO is managing at the same time.
   * We need to find a definitive way to handle this.
   */
  selectedCompanyId: Annotation<string | undefined>(),
  draftedResponse: Annotation<string | undefined>(),
  attachmentIds: Annotation<Array<string> | undefined>(),
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
  /**
   * Since we are able to do multi tasking now we are running multiple workflows in parallel.
   * That means we need to find ways to aggregate the results of the workflows.
   * Therefore we are going to give each workflow a unique id and store the results of the workflows in a map.
   */
  asyncWorkflowEngineMessages: AnnotationWithDefault<
    Record<string, Array<BaseMessage>>
  >({}),
  /**
   * Reference the workflow description and reference to the promise that will be resolved when the workflow is completed.
   * I am setting unkown to prevent type errors since this is holding a type that is identical to itself.
   * Typescript does not like the circular dependency.
   */
  workflowEngineTaskHandles: Annotation<
    | Array<{
        workflowPromise?: Promise<unknown>;
        workflowFactory: () => () => Promise<unknown>;
        processed: boolean;
        id: string;
      }>
    | undefined
  >(),

  /**
   * Tracks if all workflow engines have been completed.
   */
  allWorkflowEnginesCompleted: AnnotationWithDefault<boolean>(false),

  /**
   * original message chain
   * All human and ai messages that have been processed by the graph.
   * updated every time a run starts.
   *
   * Used for things like the sanitize_quote_for_proposal tool.
   */
  originalMessageChain: AnnotationWithDefault<Array<BaseMessage>>([]),
});
