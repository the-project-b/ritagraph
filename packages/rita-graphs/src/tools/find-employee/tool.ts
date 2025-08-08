import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createGraphQLClient,
  GraphQLClientType,
} from "../../utils/graphql/client";
import { ToolContext } from "../tool-factory";
import { Result } from "../../utils/types/result";
import { FindEmployeeByNameQuery } from "../../generated/graphql";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({ module: "Tools", tool: "find_employee" });

export const findEmployee = (ctx: ToolContext) =>
  tool(
    async ({ nameParts }) => {
      logger.info("[TOOL > find_employee]", {
        operation: "find_employee",
        companyId: ctx.selectedCompanyId,
      });
      const client = createGraphQLClient(ctx.accessToken);

      const employees = await Promise.all(
        nameParts.map((namePart) =>
          fetchEmployeeByName(client, ctx.selectedCompanyId, namePart)
        )
      );

      const unfailedSearchResults = employees.filter(Result.isSuccess);
      const foundEmployees = unfailedSearchResults.map(Result.unwrap).flat();

      if (foundEmployees.length === 0) {
        return {
          instructions: `No employees found matching the given name.`,
        };
      }

      const deduplicatedEmployees = Array.from(
        new Map(foundEmployees.map(toMappable)).values()
      );

      return {
        instructions: `
These are the employees matching the given name.
`,
        employees: deduplicatedEmployees,
      };
    },
    {
      name: "find_employee",
      description: "Find employees by first and/or last name",
      schema: z.object({
        nameParts: z
          .array(z.string())
          .describe("Parts of the name of the employee e.g. [John, Doe]"),
      }),
    }
  );

async function fetchEmployeeByName(
  client: GraphQLClientType,
  companyId: string,
  search: string
): Promise<Result<FindEmployeeByNameQuery["employees"]["employees"], Error>> {
  try {
    const { employees } = await client.findEmployeeByName({
      data: {
        companyId,
        search,
      },
    });
    // The GraphQL query returns { employees: { employees: [...] } }
    return Result.success(employees.employees);
  } catch (e) {
    return Result.failure(e as Error);
  }
}

function toMappable(
  employee: FindEmployeeByNameQuery["employees"]["employees"][number]
): [string, FindEmployeeByNameQuery["employees"]["employees"][number]] {
  return [employee.employeeId, employee];
}
