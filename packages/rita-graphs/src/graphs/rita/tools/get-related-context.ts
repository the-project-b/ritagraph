import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getRelatedContext = tool(
  (_input) => {
    // In here we can use in memory vector store to get related context
    // for now just a mock
    return `
The user is a Payroll Specialist and can request data from the payroll system.
  - Get employee and its data by id
  - Get all employees with their ids
  - For each employee get their information
  - List all employees with uncomplete information for next pay run
    `;
  },
  {
    name: "get_related_context",
    description:
      "To plan the workflow, you need to get related context from the user request",
    schema: z.object({
      userRequest: z.string(),
    }),
  }
);

export { getRelatedContext };
