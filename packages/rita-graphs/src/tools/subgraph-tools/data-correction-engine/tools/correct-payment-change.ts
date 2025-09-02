import { tool } from "@langchain/core/tools";
import { createLogger } from "@the-project-b/logging";
import { z } from "zod";
import { PaymentFrequency } from "../../../../generated/graphql";
import { DataChangeProposal } from "../../../../graphs/shared-types/base-annotation";
import { createGraphQLClient } from "../../../../utils/graphql/client";
import { ToolFactoryToolDefintion } from "../../../tool-factory";
import { getPayment, updatePayment } from "../../shared/payment-change-queries";
import { parseEffectiveDate } from "../../shared/payment-logic";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "DataCorrectionEngine",
  tool: "correct_payment_change",
});

export const correctPaymentChange: ToolFactoryToolDefintion = (ctx) =>
  tool(
    async (params, config) => {
      const {
        proposalId,
        employeeId,
        paymentId,
        contractId,
        amount,
        frequency,
        monthlyHours,
        effectiveDate,
        quote,
      } = params;
      const { selectedCompanyId } = ctx;
      const { run_id } = config.configurable;

      logger.info("Generating corrected payment change proposal", {
        proposalId,
        employeeId,
        paymentId,
        contractId,
        amount,
        frequency,
        monthlyHours,
        companyId: selectedCompanyId,
      });

      // Fetch current payment data to get employee name and validate
      const client = createGraphQLClient(ctx);
      const payments = await client.getPaymentsByContractId({
        data: {
          contractIds: [contractId],
          companyId: selectedCompanyId,
        },
      });

      const payment = payments.payments.find((p) => p.id === paymentId);
      if (!payment) {
        logger.error("Payment not found", { paymentId, contractId });
        return {
          error: `Payment ${paymentId} not found for contract ${contractId}`,
        };
      }

      // Generate a complete proposal based on the correction request
      // This is the FULL proposal that will replace the existing one
      const correctedProposal: DataChangeProposal = {
        id: proposalId, // Keep the same proposal ID
        changeType: "change" as const,
        relatedUserId: employeeId,
        relatedContractId: contractId,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
        quote,
        runId: run_id,
        iteration: 1, // Will be incremented by process-correction node

        // Generate the appropriate description and mutation based on what's changing
        description: `Change amount of payment ${payment.userFirstName} ${payment.userLastName} to ${amount}`,
        statusQuoQuery: getPayment(payment.id, "payment.properties.amount"),
        mutationQuery: updatePayment(
          {
            ...parseEffectiveDate(effectiveDate),
            id: payment.id,
            properties: {
              amount,
              monthlyHours: monthlyHours || payment.properties.monthlyHours,
            },
          },
          "payment.properties.amount",
        ),
        dynamicMutationVariables: monthlyHours
          ? undefined
          : {
              "data.properties.monthlyHours": getPayment(
                payment.id,
                "payment.properties.monthlyHours",
              ),
            },
        changedField: "payment.amount",
        newValue: amount.toFixed(2).toString(),
      };

      logger.info("Successfully generated corrected payment change proposal", {
        proposalId: correctedProposal.id,
        description: correctedProposal.description,
      });

      return {
        success: true,
        correctedProposal,
        message: `Corrected proposal: ${correctedProposal.description}`,
      };
    },
    {
      name: "correct_payment_change",
      description:
        "Generates a complete replacement proposal for payment change. Use the original proposal as your baseline, investigate current payment state if needed, then apply the requested corrections. This tool creates a full proposal that will completely replace the existing one - you must provide all required fields (employeeId, paymentId, contractId, amount, etc.), not just the changed ones.",
      schema: z.object({
        proposalId: z.string().describe("The existing proposal ID to correct"),
        quote: z
          .string()
          .describe(
            "The quote from the original proposal. Only modify if the correction specifically changes what was quoted (e.g., correcting a misquoted phrase). Otherwise, preserve the original quote.",
          ),
        employeeId: z
          .string()
          .describe("The employee ID for the payment change"),
        contractId: z.string().describe("The contract ID for the payment"),
        paymentId: z.string().describe("The payment ID to change"),
        amount: z.number().describe("The amount for the payment"),
        monthlyHours: z
          .number()
          .optional()
          .describe("The monthly hours for the payment"),
        frequency: z
          .nativeEnum(PaymentFrequency)
          .optional()
          .describe("The payment frequency"),
        effectiveDate: z
          .string()
          .optional()
          .describe(
            "The date on which the change should be effective. YYYY-MM-DD format",
          ),
      }),
    },
  );
