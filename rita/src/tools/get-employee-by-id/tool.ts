import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createGraphQLClient,
  GraphQLClientType,
} from "../../utils/graphql/client";
import { ToolContext } from "../tool-factory";
import { Result } from "../../utils/types/result";
import { GetEmployeeByIdWithExtensiveInfoQuery } from "../../generated/graphql";
import { extractContractInformation } from "./format-helper";

export const getEmployeeById = (ctx: ToolContext) =>
  tool(
    async ({ employeeId, includePaymentInfo, includeContractInfo }) => {
      console.log("[TOOL > get_employee_by_id]", ctx.selectedCompanyId);
      const client = createGraphQLClient(ctx.accessToken);

      const employee = await fetchEmployeeById(
        client,
        ctx.selectedCompanyId,
        employeeId
      );

      if (Result.isFailure(employee)) {
        return {
          instructions: `No employees found matching the id or a service error occurred.`,
        };
      }

      const employeeInfo = Result.unwrap(employee);

      let contractInformation = "";

      // Now that we have the employee we need to reduce and improve the returned format as much as possible
      const baseInformation = `
      ${employeeInfo.firstName} ${employeeInfo.lastName} (${employeeInfo.email})
      `;

      if (includeContractInfo) {
        contractInformation = extractContractInformation(employeeInfo);
      }

      const resultTemplate = `
      ${baseInformation}
      ${contractInformation}
      `;

      return resultTemplate;
    },
    {
      name: "get_employee_by_id",
      description: "Get information about an employee by their ID",
      schema: z.object({
        employeeId: z.string().describe("The ID of the employee"),
        includePaymentInfo: z.boolean().optional(),
        includeContractInfo: z.boolean().optional(),
      }),
    }
  );

async function fetchEmployeeById(
  client: GraphQLClientType,
  companyId: string,
  employeeId: string
): Promise<Result<GetEmployeeByIdWithExtensiveInfoQuery["employee"], Error>> {
  try {
    const { employee } = await client.getEmployeeByIdWithExtensiveInfo({
      data: {
        employeeCompanyId: companyId,
        employeeId,
      },
    });
    // The GraphQL query returns { employees: { employees: [...] } }
    return Result.success(employee);
  } catch (e) {
    return Result.failure(e as Error);
  }
}
