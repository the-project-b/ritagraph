import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createGraphQLClient,
  GraphQLClientType,
} from "../../utils/graphql/client";
import { ToolContext } from "../tool-factory";
import {
  EmployeeAdvancedFilterStatus,
  GetActiveEmployeesWithContractsQuery,
} from "../../generated/graphql";
import { Result } from "../../utils/types/result";

export const getActiveEmployeesWithContracts = (ctx: ToolContext) =>
  tool(
    async () => {
      console.log(
        "[TOOL > get_active_employees_with_contracts]",
        ctx.selectedCompanyId
      );
      const client = createGraphQLClient(ctx.accessToken);

      const employeesWithContracts = await fetchActiveEmployeesWithContracts(
        client,
        ctx.selectedCompanyId
      );

      if (Result.isFailure(employeesWithContracts)) {
        console.error(Result.unwrapFailure(employeesWithContracts));
        return {
          instructions: `Failed to get active employees with contracts. Tool unavailable.`,
        };
      }

      return {
        instructions: `
These are the active employees with contracts.
`,
        employees: Result.unwrap(employeesWithContracts),
      };
    },
    {
      name: "get_active_employees_with_contracts",
      description: "Get active employees with contracts",
      schema: z.object({
        employeeId: z.string().optional(),
      }),
    }
  );

async function fetchActiveEmployeesWithContracts(
  client: GraphQLClientType,
  companyId: string
): Promise<
  Result<GetActiveEmployeesWithContractsQuery["employeesByCompany"], Error>
> {
  try {
    const { employeesByCompany } = await client.getActiveEmployeesWithContracts(
      {
        data: {
          companyId,
          status: [EmployeeAdvancedFilterStatus.Active],
        },
      }
    );
    return Result.success(employeesByCompany);
  } catch (e) {
    return Result.failure(e as Error);
  }
}
