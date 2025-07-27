/**
 * This is just some bogus tool to test tool interactions and human approval flows
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../../../../utils/graphql/client";
import { ToolFactoryToolDefintion } from "../../../../tool-factory";
import { DataChangeProposal } from "../../../../../graphs/shared-types/base-annotation";
import { randomUUID as uuid } from "crypto";
import { PaymentFrequency } from "../../../../../generated/graphql";
import { ExtendedToolContext } from "../../tool";
import {
  getPayment,
  placeHolderQuery,
  updatePayment,
} from "./queries-defintions";

function prefixedLog(...message: Array<any>) {
  console.log(`[TOOL > change_payment_details]`, ...message);
}

export const changePaymentDetails: ToolFactoryToolDefintion<
  ExtendedToolContext
> = (ctx) =>
  tool(
    async ({ employeeId, contractId, newAmount, newFrequency }) => {
      console.log("[TOOL > change_payment_details]");

      const { selectedCompanyId, accessToken } = ctx;
      const { addDataChangeProposal } = ctx.extendedContext;

      const client = createGraphQLClient(accessToken);

      // 1) Get how many contracts the employee has

      prefixedLog("contractId", contractId);

      if (!contractId) {
        const employee = await client.getEmployeeById({
          data: {
            employeeId: employeeId,
            employeeCompanyId: selectedCompanyId,
          },
        });

        prefixedLog("employee", employee);
        if (!employee.employee) {
          return {
            error: "The employee id did not resolve to an employee.",
          };
        }

        const contractIds =
          employee.employee?.employeeContract?.map((contract) => contract.id) ??
          [];

        prefixedLog("contractIds", contractIds);

        if (contractIds.length > 1) {
          // Handle edge case and ask how many people to change the payment for
          return {
            error:
              "This employee has multiple contracts. Please specify which contract to change the payment for.",
          };
        }

        if (contractIds.length === 0) {
          return {
            error: "This employee does not have any contracts.",
          };
        }

        contractId = contractIds[0];
      }

      // 2) Determine the payment id

      const payments = await client.getPaymentsByContractId({
        data: {
          contractIds: [contractId!],
          companyId: selectedCompanyId,
        },
      });

      prefixedLog("payments", payments);

      const baseDataChangeProps = {
        id: uuid(),
        relatedUserId: employeeId,
        description: `Change payment details for ${employeeId}`,
        status: "pending" as "approved" | "pending" | "rejected",
        createdAt: new Date().toISOString(),
      };

      if (payments.payments.length === 0) {
        return {
          error: "This contract does not have any payments.",
        };
      }

      const newProposals: Array<DataChangeProposal> = [];
      const payment = payments.payments[0];

      prefixedLog("payment", payment);

      if (newAmount) {
        const mutation: DataChangeProposal = {
          ...baseDataChangeProps,
          description: `Change amount of payment ${payment.userFirstName} ${payment.userLastName} to ${newAmount}`,
          statusQuoQuery: getPayment(payment.id, "payment.properties.amount"),
          mutationQuery: updatePayment(
            {
              id: payment.id,
              properties: {
                amount: newAmount,
                monthlyHours: payment.properties.monthlyHours,
              },
            },
            "payment.properties.amount"
          ),
          changedField: "Salary",
          newValue: newAmount.toFixed(2).toString(),
        };
        newProposals.push(mutation);
      }

      if (newFrequency) {
        const mutation: DataChangeProposal = {
          ...baseDataChangeProps,
          description: `Change frequency of payment ${payment.userFirstName} ${payment.userLastName} to ${newFrequency}`,
          statusQuoQuery: getPayment(payment.id, "payment.frequency"),
          mutationQuery: placeHolderQuery,
          changedField: "Salary Frequency",
          newValue: newFrequency.toString(),
        };

        newProposals.push(mutation);
      }

      newProposals.forEach((proposal) => addDataChangeProposal(proposal));

      prefixedLog("dataChangeProposals", newProposals);

      return {
        instructions: `
These are the pending data change proposals. You can use them to approve the based on the confirmation of the user.
`,
        dataChangeProposals: newProposals.map((proposal) => ({
          id: proposal.id,
          description: proposal.description,
        })),
      };
    },
    {
      name: "change_payment_details",
      description:
        "Change employees payment. There are multiple properties that can be changed. Only change the ones mentioned in the request.",
      schema: z.object({
        employeeId: z
          .string()
          .optional()
          .describe(
            "The id of the employee to change the payment for either the employeeId or the contractId is required"
          ),
        contractId: z
          .string()
          .optional()
          .describe(
            "The id of the contract to change the payment for either the employeeId or the contractId is required"
          ),
        newAmount: z.number().optional(),
        newMonthlyHours: z.number().optional(),
        newFrequency: z.nativeEnum(PaymentFrequency).optional(),
      }),
    }
  );
