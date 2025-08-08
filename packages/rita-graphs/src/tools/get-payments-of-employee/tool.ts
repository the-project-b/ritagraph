import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../utils/graphql/client";
import {
  GetEmployeeByIdQuery,
  GetPaymentsQuery,
} from "../../generated/graphql";
import { ToolContext } from "../tool-factory";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({ module: "Tools", tool: "get_payments_of_employee" });

export const getPaymentsOfEmployee = (ctx: ToolContext) =>
  tool(
    async ({ employeeId }) => {
      logger.info("[TOOL > get_payments_of_employee]", {
        operation: "get_payments_of_employee",
        employeeId,
        companyId: ctx.selectedCompanyId,
      });
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
        logger.error("Failed to get employee by ID", {
          error: e,
          employeeId,
          companyId: ctx.selectedCompanyId,
        });
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
These are the payments for ${employee.employee?.firstName} ${employee.employee?.lastName} grouped by contract id.
`,
        payments: formatOutput(payments.payments),
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

function formatOutput(payments: GetPaymentsQuery["payments"]) {
  const paymentsGroupedByContractId = payments.reduce((acc, payment) => {
    acc[payment.contractId] = acc[payment.contractId] || [];
    acc[payment.contractId].push(payment);
    return acc;
  }, {} as Record<string, GetPaymentsQuery["payments"]>);

  const entries = Object.entries(paymentsGroupedByContractId);

  const result = entries
    .map(([contractId, payments]) => {
      return `Contract ID: ${contractId}
Payments:
${JSON.stringify(
  payments.map(({ contractId, ...p }) => p),
  null,
  2
)}`;
    })
    .join("\n---------\n");

  return result;
}
