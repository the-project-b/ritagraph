import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { GraphState, ConfigurableAnnotation, Node } from "../../graph-state";

export const QueryEngineState = Annotation.Root({
  ...GraphState.spec,
  userRequest: Annotation<string>(),
  query: Annotation<string | undefined>(),
  result: Annotation<string | undefined>(),
});

export type QueryEngineNode = Node<typeof QueryEngineState.State>;

// Mock query builder node
const queryBuilder: QueryEngineNode = async (state) => {
  // Mock implementation - in real scenario this would analyze the user request
  // and build an appropriate query
  const mockQuery = `SELECT * FROM employees WHERE name LIKE '%${state.userRequest}%'`;

  return {
    ...state,
    query: mockQuery,
  };
};

// Mock query executor node
const queryExecutor: QueryEngineNode = async (state) => {
  // Mock implementation - in real scenario this would execute the query
  // and return actual results from the database
  const mockResult = `Found 3 employees matching "${state.userRequest}": John Doe, Johnny Smith, Johnson Lee`;

  return {
    ...state,
    result: mockResult,
  };
};

// Create the subgraph
export const queryEngine = new StateGraph(
  QueryEngineState,
  ConfigurableAnnotation
)
  .addNode("queryBuilder", queryBuilder)
  .addNode("queryExecutor", queryExecutor)
  .addEdge(START, "queryBuilder")
  .addEdge("queryBuilder", "queryExecutor")
  .addEdge("queryExecutor", END)
  .compile();
