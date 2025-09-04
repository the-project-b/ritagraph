/**
 * Our data change proposals contain a statusQuo query to get the current status
 * and a mutation query. Both require a set of variables.
 */
export type QueryDefinition<T extends string> = {
  query: string;
  variables: Record<string, any>;
  propertyPath: string; // E.g. "employee.payments[0].amount"
  variablePathsOfRelevantProperties: Partial<Record<T, string>> | null; // propertyName -> path
};
