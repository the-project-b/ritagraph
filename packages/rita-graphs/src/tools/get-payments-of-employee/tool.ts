import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../utils/graphql/client";
import {
  GetEmployeeByIdQuery,
  GetPaymentsIncomeQuery,
  PaymentStatus,
} from "../../generated/graphql";
import { ToolContext } from "../tool-factory";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "get_payments_of_employee",
});

type PaymentViewModel = GetPaymentsIncomeQuery["paymentsIncome"][0];

export const getPaymentsOfEmployee = (ctx: ToolContext) =>
  tool(
    async ({ employeeId }) => {
      logger.info("[TOOL > get_payments_of_employee]", {
        operation: "get_payments_of_employee",
        employeeId,
        companyId: ctx.selectedCompanyId,
      });
      const client = createGraphQLClient(ctx);

      let employee: GetEmployeeByIdQuery;
      try {
        employee = await client.getEmployeeById({
          data: {
            employeeId,
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

      const queryParams = {
        data: {
          companyId: ctx.selectedCompanyId,
          status: [
            PaymentStatus.Active,
            PaymentStatus.Scheduled,
            PaymentStatus.Paused,
          ],
          contractIds:
            employee.employee?.employeeContract?.map(
              (contract) => contract.id,
            ) || [],
        },
      };

      try {
        // Do a bit of a skibbidy gyatt and just run all queries in parallel until all finished
        const [
          paymentsIncome,
          paymentsBonusesAndCommissions,
          paymentsBenefits,
          _paymentsExpensesNetAndDeductions,
        ] = await Promise.all([
          client.getPaymentsIncome(queryParams),
          client.getPaymentsBonusesAndCommissions(queryParams),
          client.getPaymentsBenefits(queryParams),
          client.getPaymentsExpensesNetAndDeductions(queryParams),
        ]);

        const allPayments: PaymentViewModel[] = [
          ...paymentsIncome.paymentsIncome,
          ...paymentsBonusesAndCommissions.paymentsBonusesAndCommissions,
          ...paymentsBenefits.paymentsBenefits,
        ];

        logger.info("Fetched payments across categories", {
          employeeId,
          totalPayments: allPayments.length,
          incomeCount: paymentsIncome.paymentsIncome.length,
          bonusesCount:
            paymentsBonusesAndCommissions.paymentsBonusesAndCommissions.length,
          benefitsCount: paymentsBenefits.paymentsBenefits.length,
        });

        return {
          instructions: `
These are the payments for ${employee.employee?.firstName} ${employee.employee?.lastName} grouped by contract id and category.`,
          payments: formatOutput(
            allPayments,
            employee.employee?.employeeContract || [],
          ),
        };
      } catch (e) {
        logger.error("Failed to fetch payments", {
          error: e,
          employeeId,
          companyId: ctx.selectedCompanyId,
        });
        return {
          error: "Failed to get payments",
        };
      }
    },
    {
      name: "get_payments_of_employee",
      description: "Get payments of an employee by their id",
      schema: z.object({
        employeeId: z.string(),
      }),
    },
  );

function formatOutput(
  payments: PaymentViewModel[],
  contracts: GetEmployeeByIdQuery["employee"]["employeeContract"],
) {
  const contractIdOnEmployeeMap = new Map(
    contracts.map((contract) => [contract.id, contract.jobTitle]),
  );

  const paymentsGroupedByContractId = payments.reduce(
    (acc, payment) => {
      acc[payment.contractId] = acc[payment.contractId] || [];
      acc[payment.contractId].push(payment);
      return acc;
    },
    {} as Record<string, PaymentViewModel[]>,
  );

  const entries = Object.entries(paymentsGroupedByContractId);

  const result = entries
    .map(([contractId, contractPayments]) => {
      const paymentsByCategory = contractPayments.reduce(
        (acc, payment) => {
          const category = payment.categorySlug || "UNCATEGORIZED";
          acc[category] = acc[category] || [];
          acc[category].push(payment);
          return acc;
        },
        {} as Record<string, PaymentViewModel[]>,
      );

      const categoryOutput = Object.entries(paymentsByCategory)
        .map(([category, categoryPayments]) => {
          return `  ${category} (${categoryPayments.length} payment${categoryPayments.length !== 1 ? "s" : ""}):
${JSON.stringify(
  categoryPayments.map(({ id, ...rest }) => ({ paymentId: id, ...rest })),
  null,
  2,
)}`;
        })
        .join("\n\n");

      return `Contract ID: ${contractId} - Job Title: ${contractIdOnEmployeeMap.get(contractId)}
Payments by Category:
${categoryOutput}`;
    })
    .join("\n---------\n");

  return result;
}
