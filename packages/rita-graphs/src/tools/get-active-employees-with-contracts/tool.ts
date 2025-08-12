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
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "get_active_employees_with_contracts",
});

export const getActiveEmployeesWithContracts = (ctx: ToolContext) =>
  tool(
    async () => {
      logger.info("[TOOL > get_active_employees_with_contracts]", {
        operation: "get_active_employees_with_contracts",
        companyId: ctx.selectedCompanyId,
      });
      const client = createGraphQLClient(ctx);

      const employeesWithContracts = await fetchActiveEmployeesWithContracts(
        client,
        ctx.selectedCompanyId,
      );

      if (Result.isFailure(employeesWithContracts)) {
        logger.error("Failed to get active employees with contracts", {
          error: Result.unwrapFailure(employeesWithContracts),
          companyId: ctx.selectedCompanyId,
        });
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
    },
  );

async function fetchActiveEmployeesWithContracts(
  client: GraphQLClientType,
  companyId: string,
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
      },
    );
    return Result.success(employeesByCompany);
  } catch (e) {
    return Result.failure(e as Error);
  }
}
