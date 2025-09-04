import { gql } from "graphql-request";
import { QueryDefinition } from "../../../utils/types/query-defintion";
import { PaymentUpdateInput } from "../../../generated/graphql";
import { ChangedField } from "../../../graphs/shared-types/base-annotation";

export const getPayment: (
  id: string,
  propertyPath: string,
) => QueryDefinition<ChangedField> = (id, propertyPath) => ({
  query: gql`
    query Payment($paymentId: String!) {
      payment(id: $paymentId) {
        frequency
        properties {
          amount
          monthlyHours
        }
      }
    }
  `,
  variables: {
    paymentId: id,
  },
  propertyPath,
  variablePathsOfRelevantProperties: null,
});

export const updatePayment: (
  variables: PaymentUpdateInput,
  propertyPath: string,
  variablePathsOfRelevantProperties: Partial<Record<ChangedField, string>>,
) => QueryDefinition<ChangedField> = (
  variables,
  propertyPath,
  variablePathsOfRelevantProperties,
) => ({
  query: gql`
    mutation PaymentUpdate($data: PaymentUpdateInput!) {
      paymentUpdate(data: $data) {
        properties {
          amount
          monthlyHours
        }
      }
    }
  `,
  variables: {
    data: variables,
  },
  propertyPath,
  variablePathsOfRelevantProperties,
});

export const placeHolderQuery: QueryDefinition<ChangedField> = {
  query: "...",
  variables: {},
  propertyPath: "...",
  variablePathsOfRelevantProperties: null,
};
