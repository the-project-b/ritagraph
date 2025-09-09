import { gql } from "graphql-request";
import { QueryDefinition } from "../../../../../utils/types/query-defintion";
import { PaymentCreateInput } from "../../../../../generated/graphql";
import { ChangedField } from "../../../../../graphs/shared-types/base-annotation";

export const createPayment: (
  variables: PaymentCreateInput,
  propertyPath: string,
  variablePathsOfRelevantProperties: Partial<Record<ChangedField, string>>,
) => QueryDefinition = (
  variables,
  propertyPath,
  variablePathsOfRelevantProperties,
) => ({
  queryId: "payment.create",
  query: gql`
    mutation PaymentCreate($data: PaymentCreateInput!) {
      paymentCreate(data: $data) {
        id
        __typename
      }
    }
  `,
  variables: {
    data: variables,
  },
  propertyPath,
  variablePathsOfRelevantProperties,
});

export const placeHolderQuery: QueryDefinition = {
  queryId: "payment.create",
  query: "...",
  variables: {},
  propertyPath: "...",
  variablePathsOfRelevantProperties: null,
};
