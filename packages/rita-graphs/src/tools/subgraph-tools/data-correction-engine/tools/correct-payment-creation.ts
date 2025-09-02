import { tool } from "@langchain/core/tools";
import { createLogger } from "@the-project-b/logging";
import { z } from "zod";
import {
  PaymentCreateInput,
  PaymentFrequency,
} from "../../../../generated/graphql";
import { DataChangeProposal } from "../../../../graphs/shared-types/base-annotation";
import { ToolFactoryToolDefintion } from "../../../tool-factory";
import { parseStartDate } from "../../shared/payment-logic";
import { createPayment } from "../../shared/payment-queries";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "DataCorrectionEngine",
  tool: "correct_payment_creation",
});

export const correctPaymentCreation: ToolFactoryToolDefintion = (ctx) =>
  tool(
    async (params, config) => {
      const {
        proposalId,
        employeeId,
        contractId,
        title,
        paymentType,
        paymentTypeId,
        amount,
        monthlyHours,
        frequency,
        startDate,
        quote,
      } = params;
      const { selectedCompanyId } = ctx;
      const { run_id } = config.configurable;

      logger.info("Generating corrected payment creation proposal", {
        proposalId,
        employeeId,
        contractId,
        companyId: selectedCompanyId,
        title,
        paymentType,
        paymentTypeId,
        amount,
        frequency,
      });

      // Build the complete mutation input for the corrected proposal
      // Use actual company ID and the provided payment type ID
      const mutationInput: PaymentCreateInput = {
        ...parseStartDate(startDate),
        contractId,
        companyId: selectedCompanyId, // Use actual company ID from context
        paymentTypeId, // Use the ID directly provided by the LLM
        properties: { amount },
      };

      // Add frequency if provided
      if (frequency !== undefined) {
        mutationInput.frequency = frequency;
      }

      // Generate a complete proposal based on the correction request
      // This is the FULL proposal that will replace the existing one
      const correctedProposal: DataChangeProposal = {
        id: proposalId, // Keep the same proposal ID
        changeType: "creation" as const,
        relatedUserId: employeeId,
        relatedContractId: contractId,
        description: `Create a new ${title} payment for ${employeeId}`,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
        quote,
        runId: run_id,
        iteration: 1, // Will be incremented by process-correction node
        mutationQuery: createPayment(mutationInput, ""),
        properties: {
          amount: amount?.toString() ?? "",
          monthlyHours: monthlyHours?.toString() ?? "",
          ...(frequency !== undefined && { frequency: frequency.toString() }),
        },
      };

      logger.info(
        "Successfully generated corrected payment creation proposal",
        {
          proposalId: correctedProposal.id,
          description: correctedProposal.description,
          paymentTypeId: mutationInput.paymentTypeId,
          companyId: mutationInput.companyId,
        },
      );

      return {
        success: true,
        correctedProposal,
        message: `Corrected proposal: ${correctedProposal.description}`,
      };
    },
    {
      name: "correct_payment_creation",
      description:
        "Generates a complete replacement proposal for payment creation. Use ALL properties from the original proposal as your baseline, then apply the requested corrections. This tool creates a full proposal that will completely replace the existing one - you must provide all required fields, not just the changed ones.",
      schema: z.object({
        proposalId: z.string().describe("The existing proposal ID to correct"),
        quote: z
          .string()
          .describe(
            "The quote from the original proposal. Only modify if the correction specifically changes what was quoted (e.g., correcting a misquoted phrase). Otherwise, preserve the original quote.",
          ),
        employeeId: z.string().describe("The employee ID for the payment"),
        contractId: z.string().describe("The contract ID for the payment"),
        title: z
          .string()
          .describe(
            "The title/description of the payment (e.g., 'Bonus Payment', 'Salary')",
          ),
        paymentType: z
          .string()
          .optional()
          .describe(
            "The payment type slug (e.g., 'bonus', 'salary'). This is for reference only.",
          ),
        paymentTypeId: z
          .union([z.string(), z.number()])
          .describe(
            "The payment type ID. For bonuses use 8, for salary use appropriate ID from the original proposal or payment types list.",
          ),
        amount: z.number().optional().describe("The payment amount"),
        monthlyHours: z
          .number()
          .optional()
          .describe("The monthly hours (usually not needed for bonuses)"),
        frequency: z
          .nativeEnum(PaymentFrequency)
          .optional()
          .describe("The payment frequency (e.g., SINGLE_TIME for bonuses)"),
        startDate: z
          .string()
          .optional()
          .describe("The start date for the payment. YYYY-MM-DD format"),
      }),
    },
  );
