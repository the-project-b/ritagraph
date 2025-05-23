export default `# Using graphql MCP effectively

Make sure to follow these instructions to help you effectively querying and mutating on our graphqlapi

Schema Analysis First: "Before constructing any query, analyze the relevant schema sections to understand entity relationships and available fields."
Type Safety Verification: "For each GraphQL operation, verify the exact type structure, especially for union types, interfaces, and required fields."
Incremental Testing: "Start with minimal queries to verify assumptions before expanding to more complex operations."
Error-Driven Refinement: "When encountering errors, analyze them fully before refining the approach rather than making small adjustments."
Parameter Validation: "Validate all input parameters against schema requirements before executing mutations."
Field Existence Check: "Confirm each requested field exists on the specific type being queried."
Domain-Aware Querying: "Consider the domain context when constructing queries, as schema structure often reflects business relationships."
"Always use inline fragments with ... on TypeName syntax when querying union types or interfaces."
"When encountering a union type, examine all possible concrete types it can return and include appropriate fragments for each relevant one."
"Check for shared fields across union members to avoid redundancy, but never assume fields exist across all union members without verification."
"When a query returns a union type like EmployeeHrBpoAdminUnion, always use type-specific fragments instead of attempting to query fields directly on the union."
"Apply type conditionals for fields that only exist on specific union members rather than trying to access them directly."`;