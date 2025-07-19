/**
 * This is just some bogus tool to test tool interactions and human approval flows
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../utils/graphql/client";
import { ToolContext } from "../tool-context";
import { Mutation } from "../../graphs/shared-types/base-annotation";
import { randomUUID as uuid } from "crypto";
import { Command, getCurrentTaskInput } from "@langchain/langgraph";
import { ToolMessage } from "@langchain/core/messages";
import { PaymentFrequency } from "../../generated/graphql";

function prefixedLog(...message: Array<any>) {
  console.log(`[TOOL > change_payment_details]`, ...message);
}

export const changePaymentDetails = (ctx: ToolContext) =>
  tool(
    async (
      { employeeId, contractId, newAmount, newFrequency },
      { toolCall }
    ) => {
      console.log("[TOOL > change_payment_details]");

      const client = createGraphQLClient(ctx.accessToken);

      // 1) Get how many contracts the employee has

      prefixedLog("contractId", contractId);

      if (!contractId) {
        const employee = await client.getEmployeeById({
          data: {
            employeeId: employeeId,
            employeeCompanyId: ctx.selectedCompanyId,
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
          companyId: ctx.selectedCompanyId,
        },
      });

      prefixedLog("payments", payments);

      if (payments.payments.length === 0) {
        return {
          error: "This contract does not have any payments.",
        };
      }

      const mutations: Array<Mutation> = [];
      const payment = payments.payments[0];

      prefixedLog("payment", payment);

      if (newAmount) {
        const mutation: Mutation = {
          id: uuid(),
          description: `Change amount of payment ${payment.userFirstName} ${payment.userLastName} to ${newAmount}`,
          status: "pending",
          createdAt: new Date().toISOString(),
          statusQuoQuery: "...",
          mutationQuery: "...",
          variables: {
            id: payment.id,
            newAmount: newAmount,
          },
        };
        mutations.push(mutation);
      }

      if (newFrequency) {
        const mutation: Mutation = {
          id: uuid(),
          description: `Change frequency of payment ${payment.userFirstName} ${payment.userLastName} to ${newFrequency}`,
          status: "pending",
          createdAt: new Date().toISOString(),
          statusQuoQuery: "...",
          mutationQuery: "...",
          variables: {
            id: payment.id,
            newFrequency: newFrequency,
          },
        };

        mutations.push(mutation);
      }

      const existingMutations = (getCurrentTaskInput() as any).mutations ?? [];

      prefixedLog("mutations", mutations);

      return new Command({
        update: {
          mutations: [...existingMutations, ...mutations],
          // Why not use taskEngineMessages? Well our tool node maps the messages to the taskEngineMessages (this way tools are more universal)
          messages: [
            new ToolMessage({
              content: `Scheduled a mutation to change the payment details for ${payment.userFirstName} ${payment.userLastName}. You can confirm the scheduled by listing the mutations`,
              tool_call_id: toolCall.id,
            }),
          ],
        },
      });
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
