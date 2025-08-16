import { gql } from "graphql-request";
import { QueryDefinition } from "../../../../../utils/types/query-defintion";
import { PaymentCreateInput } from "../../../../../generated/graphql";

export const createPayment: (
  variables: PaymentCreateInput,
  propertyPath: string,
) => QueryDefinition = (variables, propertyPath) => ({
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
});

export const placeHolderQuery: QueryDefinition = {
  query: "...",
  variables: {},
  propertyPath: "...",
};
