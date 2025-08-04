import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../utils/graphql/client";
import { GetEmployeeByIdQuery } from "../../generated/graphql";
import { ToolContext } from "../tool-factory";

export const getPaymentsOfEmployee = (ctx: ToolContext) =>
  tool(
    async ({ employeeId }) => {
      console.log(
        "[TOOL > get_payments_of_employee] for employeeId: %s",
        employeeId
      );
      const client = createGraphQLClient(ctx.accessToken);

      let employee: GetEmployeeByIdQuery;
      try {
        employee = await client.getEmployeeById({
          data: {
            employeeId: employeeId!,
            employeeCompanyId: ctx.selectedCompanyId,
          },
        });
      } catch (e) {
        console.error(e);
        return {
          error: "Failed to get payments",
        };
      }

      const payments = await client.getPayments({
        data: {
          companyId: ctx.selectedCompanyId,
          contractIds: employee.employee?.employeeContract?.map(
            (contract) => contract.id
          ),
        },
      });

      return {
        instructions: `
These are the payments for ${employee.employee?.firstName} ${employee.employee?.lastName}
`,
        payments: payments.payments,
      };
    },
    {
      name: "get_payments_of_employee",
      description: "Get payments of an employee by their id",
      schema: z.object({
        employeeId: z.string().optional(),
      }),
    }
  );
