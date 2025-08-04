import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../utils/graphql/client";
import { ToolContext } from "../tool-factory";
import { Result } from "../../utils/types/result";
import {
  extractContractInformation,
  extractPaymentInformation,
} from "./format-helper";
import { fetchEmployeeById, fetchPaymentsOfEmployee } from "./fetch-helper";

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
      let paymentInformation = "";

      // Now that we have the employee we need to reduce and improve the returned format as much as possible
      const baseInformation = `
      ${employeeInfo.firstName} ${employeeInfo.lastName} (${employeeInfo.email})
      `;

      if (includeContractInfo) {
        contractInformation = extractContractInformation(employeeInfo);
      }

      if (includePaymentInfo) {
        const paymentsResult = await fetchPaymentsOfEmployee(
          client,
          ctx.selectedCompanyId,
          employeeInfo.employeeContract
        );
        if (Result.isFailure(paymentsResult)) {
          return {
            instructions: `No payments found for the employee or problems retrieving payments.`,
          };
        }

        paymentInformation = extractPaymentInformation(
          Result.unwrap(paymentsResult)
        );
      }

      const resultTemplate = `
      ${baseInformation}
      ${contractInformation}
      ${paymentInformation}
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
