import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  GraphQLClientType,
  createGraphQLClient,
} from "../../../../../utils/graphql/client";
import { ToolContext } from "../../../../tool-factory";
import { Result } from "../../../../../utils/types/result";
import { FindEmployeeByNameWithContractQuery } from "../../../../../generated/graphql";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({ module: "Tools", tool: "find_employee_by_name_with_contract" });

export const findEmployeeByNameWithContract = (ctx: ToolContext) =>
  tool(
    async ({ nameParts }) => {
      logger.info("[TOOL > find_employee_by_name_with_contract]", {
        operation: "find_employee_by_name_with_contract",
        companyId: ctx.selectedCompanyId,
      });
      const client = createGraphQLClient(ctx.accessToken);

      const employees = await Promise.all(
        nameParts.map((namePart) =>
          fetchEmployeeByName(client, ctx.selectedCompanyId, namePart),
        ),
      );

      const unfailedSearchResults = employees.filter(Result.isSuccess);
      const foundEmployees = unfailedSearchResults
        .map(Result.unwrap)
        .flat()
        .filter(isActiveContract);

      if (foundEmployees.length === 0) {
        return {
          instructions: `No employees found matching the given name.`,
        };
      }

      const deduplicatedEmployees = Array.from(
        new Map(foundEmployees.map(toMappable)).values(),
      );

      return {
        instructions: `
These are the employees matching the given name.
`,
        employees: deduplicatedEmployees,
      };
    },
    {
      name: "find_employee_by_name_with_contract",
      description:
        "Find employees by first and/or last name and get their contract information",
      schema: z.object({
        nameParts: z
          .array(z.string())
          .describe("Parts of the name of the employee e.g. [John, Doe]"),
      }),
    },
  );

async function fetchEmployeeByName(
  client: GraphQLClientType,
  companyId: string,
  search: string,
): Promise<
  Result<FindEmployeeByNameWithContractQuery["employees"]["employees"], Error>
> {
  try {
    const { employees } = await client.findEmployeeByNameWithContract({
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
  employee: FindEmployeeByNameWithContractQuery["employees"]["employees"][number],
): [
  string,
  FindEmployeeByNameWithContractQuery["employees"]["employees"][number],
] {
  return [employee.employeeId, employee];
}

function isActiveContract(
  contract: FindEmployeeByNameWithContractQuery["employees"]["employees"][number],
) {
  const now = new Date();

  return (
    (contract.contractEnd === null ||
      Date.parse(contract.contractEnd) >= now.getTime()) &&
    Date.parse(contract.contractStart) <= now.getTime()
  );
}
