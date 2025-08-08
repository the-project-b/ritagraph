import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../utils/graphql/client";
import {
  GetEmployeeByIdQuery,
  GetPaymentsQuery,
  PaymentStatus,
} from "../../generated/graphql";
import { ToolContext } from "../tool-factory";

export const getPaymentsOfEmployee = (ctx: ToolContext) =>
  tool(
    async ({ employeeId }) => {
      console.log(
        "[TOOL > get_payments_of_employee] for employeeId: %s",
        employeeId,
      );
      const client = createGraphQLClient(ctx.accessToken);

      let employee: GetEmployeeByIdQuery;
      try {
        employee = await client.getEmployeeById({
          data: {
            employeeId,
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
          status: [
            PaymentStatus.Active,
            PaymentStatus.Scheduled,
            PaymentStatus.Paused,
          ],
          contractIds: employee.employee?.employeeContract?.map(
            (contract) => contract.id,
          ),
        },
      });

      return {
        instructions: `
These are the payments for ${employee.employee?.firstName} ${employee.employee?.lastName} grouped by contract id.
`,
        payments: formatOutput(payments.payments),
      };
    },
    {
      name: "get_payments_of_employee",
      description: "Get payments of an employee by their id",
      schema: z.object({
        employeeId: z.string(),
      }),
    },
  );

function formatOutput(payments: GetPaymentsQuery["payments"]) {
  const paymentsGroupedByContractId = payments.reduce(
    (acc, payment) => {
      acc[payment.contractId] = acc[payment.contractId] || [];
      acc[payment.contractId].push(payment);
      return acc;
    },
    {} as Record<string, GetPaymentsQuery["payments"]>,
  );

  const entries = Object.entries(paymentsGroupedByContractId);

  const result = entries
    .map(([contractId, payments]) => {
      return `Contract ID: ${contractId}
Payments:
${JSON.stringify(
  payments.map(({ contractId, ...p }) => p),
  null,
  2,
)}`;
    })
    .join("\n---------\n");

  return result;
}
