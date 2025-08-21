// Note this is a copy paste of data change proposal (we should probably just export this)

export type QueryDefinition = {
  query: string;
  variables: Record<string, any>;
  propertyPath: string; // E.g. "employee.payments[0].amount"
};

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
      quote?: string;
    }
  | {
      changeType: "creation";
      mutationQuery: QueryDefinition;
      properties: Record<string, string>;
      quote?: string;
    }
);
