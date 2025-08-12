import { tool } from "@langchain/core/tools";
import { createLogger } from "@the-project-b/logging";
import { z } from "zod";
import { EmployeeAdvancedFilterStatus } from "../../generated/graphql";
import { createGraphQLClient } from "../../utils/graphql/client";
import { Result } from "../../utils/types/result";
import { ToolContext } from "../tool-factory";
import { fetchAllEmployees } from "./helper/fetch-helper";
import { applyFilters, Filter } from "./helper/filter-engine";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "get_all_employees",
});

const filters = z
  .object({
    status: Filter(
      ["eq", "ne"],
      z.enum(
        Object.values(EmployeeAdvancedFilterStatus) as [string, ...string[]],
      ),
    ).optional(),
    email: Filter(["contains", "startsWith", "endsWith"]).optional(),
    incomeSum: Filter(["eq", "ne", "gt", "gte", "lt", "lte"]).optional(),
    contractStart: Filter(
      ["eq", "ne", "gt", "gte", "lt", "lte"],
      z.string().datetime(),
    ).optional(),
    contractEnd: Filter(
      ["eq", "ne", "gt", "gte", "lt", "lte"],
      z.string().datetime(),
    ).optional(),
  })
  .optional();

const includeDefintion = z.object({
  missingFields: z.boolean().optional(),
});

export type GetAllEmployeesFilter = z.infer<typeof filters>;

/**
 * Since employees is actually "contracts" the employees will contain the same person multiple times if the person has multiple contracts.
 */
export const getAllEmployees = (ctx: ToolContext) =>
  tool(
    async ({ filters, include }) => {
      logger.info("[TOOL > get_all_employees]", {
        operation: "get_all_employees",
        companyId: ctx.selectedCompanyId,
      });
      const client = createGraphQLClient(ctx);

      const employeesWithContractsResult = await fetchAllEmployees(
        client,
        ctx.selectedCompanyId,
      );

      if (Result.isFailure(employeesWithContractsResult)) {
        logger.error("Failed to fetch employees with contracts", {
          error: Result.unwrapFailure(employeesWithContractsResult),
          companyId: ctx.selectedCompanyId,
        });
        return {
          instructions: `Failed to get active employees with contracts. Tool unavailable.`,
        };
      }
      const employeesWithContracts = Result.unwrap(
        employeesWithContractsResult,
      );

      const filteredEmployees = applyFilters(employeesWithContracts, filters);

      let finalResponse = [];

      finalResponse = filteredEmployees.map((employee) => {
        const {
          missingFieldsBPO,
          missingFieldsHR,
          missingFieldsEmployee,
          ...rest
        } = employee;

        const employeeObject: any = { ...rest };

        if (include.missingFields) {
          employeeObject.missingFieldsBPO = missingFieldsBPO;
          employeeObject.missingFieldsHR = missingFieldsHR;
          employeeObject.missingFieldsEmployee = missingFieldsEmployee;
        }

        return employeeObject;
      });

      // if (include.missingFields) {
      // }

      return {
        instructions: `
These are the active employees with contracts.
`,
        employees: filteredEmployees,
      };
    },
    {
      name: "get_active_employees_with_contracts",
      description: "Get active employees with contracts",
      schema: z.object({
        filters,
        include: includeDefintion,
      }),
    },
  );
