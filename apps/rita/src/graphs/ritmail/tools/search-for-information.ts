/**
 * Tool that wraps a subgraph for query building and execution
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";

// Define the state for the query subgraph
interface QueryState {
  userRequest: string;
  generatedQuery?: string;
  queryResult?: any;
  error?: string;
}

// Node 1: Query Builder - generates SQL queries from natural language
const queryBuilder = async (state: QueryState) => {
  console.log("🔧 Query Builder - Generating SQL query");

  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  const queryPrompt = PromptTemplate.fromTemplate(`
You are a SQL expert. Generate a SQL query based on the user request.
Available tables:
- employees (id, name, salary, department, hire_date, is_active)
- contracts (id, employee_id, contract_type, start_date, end_date)

User Request: {userRequest}

Generate a valid SQL query that answers the user's request.
`);

  const formattedPrompt = await queryPrompt.format({
    userRequest: state.userRequest,
  });

  const response = await llm.invoke(formattedPrompt);

  return {
    ...state,
    generatedQuery: response.content as string,
  };
};

// Node 2: Query Executor - executes the generated query
const queryExecutor = async (state: QueryState) => {
  console.log("⚡ Query Executor - Executing query");

  try {
    // Mock database execution - in real scenario this would connect to actual DB
    const mockResults = {
      "SELECT * FROM employees WHERE salary > 50000": [
        { id: 1, name: "John Doe", salary: 75000, department: "Engineering" },
        { id: 2, name: "Jane Smith", salary: 65000, department: "Sales" },
      ],
      "SELECT COUNT(*) as contract_count FROM contracts WHERE employee_id = 1":
        [{ contract_count: 3 }],
      "SELECT * FROM employees": [
        { id: 1, name: "John Doe", salary: 75000, department: "Engineering" },
        { id: 2, name: "Jane Smith", salary: 65000, department: "Sales" },
        { id: 3, name: "Bob Johnson", salary: 55000, department: "Marketing" },
      ],
    };

    const result = mockResults[state.generatedQuery!] || [
      ...mockResults["SELECT * FROM employees"],
    ];

    return {
      ...state,
      queryResult: result,
    };
  } catch (error) {
    return {
      ...state,
      error: `Query execution failed: ${error}`,
    };
  }
};

// Create the query subgraph
const querySubgraph = new StateGraph<QueryState>({
  channels: {
    userRequest: { reducer: (x: string) => x },
    generatedQuery: { reducer: (x: string) => x },
    queryResult: { reducer: (x: any) => x },
    error: { reducer: (x: string) => x },
  },
})
  .addNode("queryBuilder", queryBuilder)
  .addNode("queryExecutor", queryExecutor)
  .addEdge(START, "queryBuilder")
  .addEdge("queryBuilder", "queryExecutor")
  .addEdge("queryExecutor", END)
  .compile();

// Tool that wraps the subgraph
const searchForInformation = tool(
  async (input: { userRequest: string }) => {
    console.log("🔍 Search for Information Tool - Starting query subgraph");

    const result = await querySubgraph.invoke({
      userRequest: input.userRequest,
    });

    if (result.error) {
      return `Error: ${result.error}`;
    }

    return {
      query: result.generatedQuery,
      result: result.queryResult,
      summary: `Successfully executed query for: ${input.userRequest}`,
    };
  },
  {
    name: "custom_search",
    description:
      "Describe what information you want to search for in the database like employees by name or all employees",
    schema: z.object({
      userRequest: z
        .string()
        .describe("Natural language description of what data to search for"),
    }),
  }
);

export { searchForInformation };
