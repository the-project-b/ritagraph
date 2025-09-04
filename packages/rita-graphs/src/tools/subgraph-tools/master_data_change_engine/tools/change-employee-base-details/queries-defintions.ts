import { gql } from "graphql-request";
import { QueryDefinition } from "../../../../../utils/types/query-defintion";
import { PaymentUpdateInput } from "../../../../../generated/graphql";

export const getPayment: (
  id: string,
  propertyPath: string,
) => QueryDefinition = (id, propertyPath) => ({
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
});

export const updatePayment: (
  variables: PaymentUpdateInput,
  propertyPath: string,
) => QueryDefinition = (variables, propertyPath) => ({
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
});

export const placeHolderQuery: QueryDefinition = {
  query: "...",
  variables: {},
  propertyPath: "...",
};
