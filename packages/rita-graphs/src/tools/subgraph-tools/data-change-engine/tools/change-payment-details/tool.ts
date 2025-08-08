import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphQLClient } from "../../../../../utils/graphql/client";
import {
  ToolContext,
  ToolFactoryToolDefintion,
} from "../../../../tool-factory";
import { DataChangeProposal } from "../../../../../graphs/shared-types/base-annotation";
import { randomUUID as uuid } from "crypto";
import {
  CreateRitaThreadItemMutation,
  PaymentFrequency,
} from "../../../../../generated/graphql";
import {
  getPayment,
  placeHolderQuery,
  updatePayment,
} from "./queries-defintions";
import { Result } from "../../../../../utils/types/result";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "rita-graphs" }).child({ module: "Tools", tool: "change_payment_details" });

function prefixedLog(message: string, data?: any) {
  logger.debug(message, data);
}

export const changePaymentDetails: ToolFactoryToolDefintion<ToolContext> = (
  ctx,
) =>
  tool(
    async (
      {
        employeeId,
        paymentId,
        contractId,
        newAmount,
        newFrequency,
        newMonthlyHours,
      },
      config,
    ) => {
      const { selectedCompanyId, accessToken } = ctx;
      const { thread_id } = config.configurable;

      logger.info("[TOOL > change_payment_details]", {
        operation: "change_payment_details",
        threadId: thread_id,
        employeeId,
        paymentId,
        contractId,
        companyId: selectedCompanyId,
      });

      const client = createGraphQLClient(accessToken);

      // 1) Get how many contracts the employee has

      prefixedLog("contractId", contractId);

      // 2) Determine the payment id

      const payments = await client.getPaymentsByContractId({
        data: {
          contractIds: [contractId!],
          companyId: selectedCompanyId,
        },
      });

      prefixedLog("payments", payments);

      const buildBaseDataChangeProps = () => ({
        id: uuid(),
        relatedUserId: employeeId,
        description: `Change payment details for ${employeeId}`,
        status: "pending" as "approved" | "pending" | "rejected",
        createdAt: new Date().toISOString(),
      });

      if (payments.payments.length === 0) {
        return {
          error: "This contract does not have any payments.",
        };
      }

      const newProposals: Array<DataChangeProposal> = [];
      const payment = payments.payments.find(
        (payment) => payment.id === paymentId,
      );

      if (!payment) {
        return {
          error: `This payment does not exist. Those are the existing paymentIds payments: ${JSON.stringify(
            payments.payments,
            null,
            2,
          )}`,
        };
      }

      prefixedLog("payment", payment);

      if (newAmount) {
        // Amount changes require the monthly hours to be present - race conditions can happen where we schedule the
        // change but at the time that is approved the monthly hours "are silently" changed to a different value.
        // That is why we utilize the dynamic mutation variables

        const dataChangeProposal: DataChangeProposal = {
          ...buildBaseDataChangeProps(),
          description: `Change amount of payment ${payment.userFirstName} ${payment.userLastName} to ${newAmount}`,
          statusQuoQuery: getPayment(payment.id, "payment.properties.amount"),
          mutationQuery: updatePayment(
            {
              id: payment.id,
              properties: {
                amount: newAmount,
                monthlyHours: "to-be-determined" as any,
              },
            },
            "payment.properties.amount",
          ),
          dynamicMutationVariables: {
            "data.properties.monthlyHours": getPayment(
              payment.id,
              "payment.properties.monthlyHours",
            ),
          },
          changedField: "Salary",
          newValue: newAmount.toFixed(2).toString(),
        };
        newProposals.push(dataChangeProposal);
      }

      if (newMonthlyHours) {
        const dataChangeProposal: DataChangeProposal = {
          ...buildBaseDataChangeProps(),
          description: `Change monthly hours of payment ${payment.userFirstName} ${payment.userLastName} to ${newMonthlyHours}`,
          statusQuoQuery: getPayment(
            payment.id,
            "payment.properties.monthlyHours",
          ),
          mutationQuery: updatePayment(
            {
              id: payment.id,
              properties: {
                amount: "to-be-determined" as any,
                monthlyHours: newMonthlyHours,
              },
            },
            "payment.properties.monthlyHours",
          ),
          dynamicMutationVariables: {
            "data.properties.amount": getPayment(
              payment.id,
              "payment.properties.amount",
            ),
          },
          changedField: "Monthly Hours",
          newValue: newMonthlyHours.toString(),
        };
        newProposals.push(dataChangeProposal);
      }

      if (newFrequency) {
        const dataChangeProposal: DataChangeProposal = {
          ...buildBaseDataChangeProps(),
          description: `Change frequency of payment ${payment.userFirstName} ${payment.userLastName} to ${newFrequency}`,
          statusQuoQuery: getPayment(payment.id, "payment.frequency"),
          mutationQuery: placeHolderQuery,
          changedField: "Salary Frequency",
          newValue: newFrequency.toString(),
        };

        newProposals.push(dataChangeProposal);
      }

      const newProposalDbUpdateResults = await Promise.all(
        newProposals.map((proposal) =>
          createThreadItemForProposal(proposal, thread_id, accessToken),
        ),
      );

      // TODO: Remove this once we have a way to handle failed thread items
      if (newProposalDbUpdateResults.some(Result.isFailure)) {
        const failedThreadItems = newProposalDbUpdateResults.filter(
          Result.isFailure,
        );
        const issues = failedThreadItems
          .map((item) => Result.unwrapFailure(item))
          .join("\n");

        logger.error("Failed to create thread items for the data change proposals", {
          threadId: thread_id,
          issues,
          employeeId,
          paymentId,
          contractId,
          companyId: selectedCompanyId,
        });

        return {
          error: "Failed to create thread items for the data change proposals.",
        };
      }

      //newProposals.forEach((proposal) => addDataChangeProposal(proposal));

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
        employeeId: z.string(),
        contractId: z.string(),
        paymentId: z.string(),
        newAmount: z.number().optional(),
        newMonthlyHours: z.number().optional(),
        newFrequency: z.nativeEnum(PaymentFrequency).optional(),
      }),
    },
  );

async function createThreadItemForProposal(
  proposal: DataChangeProposal,
  threadId: string,
  accessToken: string,
): Promise<Result<CreateRitaThreadItemMutation>> {
  try {
    const client = createGraphQLClient(accessToken);
    const threadItem = await client.createRitaThreadItem({
      input: {
        ritaThreadId: threadId,
        data: {
          type: "DATA_CHANGE_PROPOSAL",
          proposal,
        },
      },
    });

    return Result.success(threadItem);
  } catch (error) {
    return Result.failure(error as Error);
  }
}
