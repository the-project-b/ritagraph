import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../utils/graphql/client";
import { ToolContext } from "../tool-factory";
import {
  EmployeeAdvancedFilterStatus,
  GetActiveEmployeesWithContractsQuery,
} from "../../generated/graphql";
import { Result } from "../../utils/types/result";
import { applyFilters, Filter } from "./helper/filter-engine";
import { fetchAllEmployees } from "./helper/fetch-helper";

const filters = z
  .object({
    status: Filter(
      ["eq", "ne"],
      z.enum(
        Object.values(EmployeeAdvancedFilterStatus) as [string, ...string[]]
      )
    ).optional(),
    email: Filter(["contains", "startsWith", "endsWith"]).optional(),
    incomeSum: Filter(["eq", "ne", "gt", "gte", "lt", "lte"]).optional(),
    contractStart: Filter(
      ["eq", "ne", "gt", "gte", "lt", "lte"],
      z.string().datetime()
    ).optional(),
    contractEnd: Filter(
      ["eq", "ne", "gt", "gte", "lt", "lte"],
      z.string().datetime()
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
      console.log("[TOOL > get_all_employees]", ctx.selectedCompanyId);
      const client = createGraphQLClient(ctx.accessToken);

      const employeesWithContractsResult = await fetchAllEmployees(
        client,
        ctx.selectedCompanyId
      );

      if (Result.isFailure(employeesWithContractsResult)) {
        console.error(Result.unwrapFailure(employeesWithContractsResult));
        return {
          instructions: `Failed to get active employees with contracts. Tool unavailable.`,
        };
      }
      const employeesWithContracts = Result.unwrap(
        employeesWithContractsResult
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

        let employeeObject: any = { ...rest };

        if (include.missingFields) {
          employeeObject.missingFieldsBPO = missingFieldsBPO;
          employeeObject.missingFieldsHR = missingFieldsHR;
          employeeObject.missingFieldsEmployee = missingFieldsEmployee;
        }

        return employeeObject;
      });

      if (include.missingFields) {
      }

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
        filters: filters,
        include: includeDefintion,
      }),
    }
  );
