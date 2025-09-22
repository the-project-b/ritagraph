import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ToolFactoryToolDefintion } from "../../../../tool-factory";
import { DataChangeProposal } from "../../../../../graphs/shared-types/base-annotation";
import { randomUUID as uuid } from "crypto";
import { PaymentFrequency } from "../../../../../generated/graphql";
import { createPayment } from "./queries-defintions";
import { Result } from "../../../../../utils/types/result";
import { createLogger } from "@the-project-b/logging";
import { appendDataChangeProposalsAsThreadItems } from "../../../../../utils/append-message-as-thread-item";
import { ExtendedToolContext, PaymentType } from "../../tool";
import {
  AgentActionType,
  AgentLogEventTag,
} from "../../../../../utils/agent-action-logger/AgentActionLogger";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "Tools",
  tool: "create_payment",
});

function prefixedLog(message: string, data?: any) {
  logger.debug(message, data);
}

export const createPaymentTool: ToolFactoryToolDefintion<
  ExtendedToolContext
> = (ctx) =>
  tool(
    async (params, config) => {
      const {
        employeeId,
        contractId,
        title,
        paymentType,
        amount,
        monthlyHours,
        frequency,
        startDate,
        quote,
      } = params;
      const { selectedCompanyId, agentActionLogger } = ctx;
      const { thread_id, run_id } = config.configurable;

      logger.info("[TOOL > create_payment]", {
        operation: "create_payment",
        threadId: thread_id,
        employeeId,
        contractId,
        title,
        paymentType,
        amount,
        monthlyHours,
        frequency,
        startDate,
        companyId: selectedCompanyId,
      });

      agentActionLogger.appendLog({
        description: `Creating payment for employeeId: ${employeeId}. Based on the user quote: ${quote}`,
        actionName: "create_payment",
        actionType: AgentActionType.TOOL_CALL_ENTER,
        relationId: config.toolCall.id,
        runId: run_id,
        tags: [AgentLogEventTag.DATA_CHANGE_PROPOSAL],
      });

      const buildBaseDataChangeProps = () => ({
        id: uuid(),
        changeType: "creation" as const,
        relatedUserId: employeeId,
        relatedContractId: contractId,
        description: `Create payment for ${employeeId}`,
        status: "pending" as "approved" | "pending" | "rejected",
        createdAt: new Date().toISOString(),
        quote,
        runId: run_id,
        iteration: 1, // Initial iteration for new proposals
      });

      const dataChangeProposal: DataChangeProposal = {
        ...buildBaseDataChangeProps(),
        description: `Create a new ${title} payment for ${employeeId}`,
        mutationQuery: createPayment(
          {
            ...parseStartDate(startDate),
            frequency,
            contractId,
            companyId: ctx.selectedCompanyId,
            paymentTypeId: paymentTypeToId(
              paymentType,
              ctx.extendedContext?.paymentTypes ?? [],
            ),
            properties: {
              amount,
            },
          },
          "",
          {
            "payment.amount": "data.properties.amount",
            "payment.monthlyHours": "data.properties.monthlyHours",
            "payment.frequency": "data.properties.frequency",
          },
        ),
        properties: {
          amount: amount?.toString() ?? "",
          monthlyHours: monthlyHours?.toString() ?? "",
          frequency: frequency?.toString() ?? "",
        },
      };

      const appendDataChangeProposalsAsThreadItemsResult =
        await appendDataChangeProposalsAsThreadItems({
          dataChangeProposals: [dataChangeProposal],
          langgraphThreadId: thread_id,
          context: {
            accessToken: ctx.accessToken,
            appdataHeader: ctx.appdataHeader,
            selectedCompanyId: ctx.selectedCompanyId,
          },
        });

      agentActionLogger.appendLog({
        description: `Created proposal for: ${dataChangeProposal.description}`,
        actionName: "create_payment",
        actionType: AgentActionType.TOOL_CALL_LOG,
        relationId: config.toolCall.id,
        runId: run_id,
        tags: [AgentLogEventTag.DATA_CHANGE_PROPOSAL],
      });

      if (Result.isFailure(appendDataChangeProposalsAsThreadItemsResult)) {
        agentActionLogger.appendLog({
          description: `But failed to persist the change proposals. User might need to retry the same request.`,
          actionName: "create_payment",
          actionType: AgentActionType.TOOL_CALL_RESPONSE,
          relationId: config.toolCall.id,
          runId: run_id,
          tags: [AgentLogEventTag.DATA_CHANGE_PROPOSAL],
        });
        return {
          error: "Failed to create thread items - tool call unavailable.",
        };
      }

      const newProposalDbUpdateResults = Result.unwrap(
        appendDataChangeProposalsAsThreadItemsResult,
      );

      // TODO: Remove this once we have a way to handle failed thread items
      if (newProposalDbUpdateResults.some(Result.isFailure)) {
        const failedThreadItems = newProposalDbUpdateResults.filter(
          Result.isFailure,
        );

        const issues = failedThreadItems
          .map((item) => Result.unwrapFailure(item))
          .join("\n");

        agentActionLogger.appendLog({
          description: `But failed to persist the change proposals. User might need to retry the same request.`,
          actionName: "create_payment",
          actionType: AgentActionType.TOOL_CALL_RESPONSE,
          relationId: config.toolCall.id,
          runId: run_id,
          tags: [AgentLogEventTag.DATA_CHANGE_PROPOSAL],
        });

        logger.error(
          "Failed to create thread items for the data change proposals",
          {
            threadId: thread_id,
            issues,
            employeeId,
            contractId,
            companyId: selectedCompanyId,
          },
        );

        return {
          error: "Failed to create thread items for the data change proposals.",
        };
      }

      prefixedLog("dataChangeProposals", dataChangeProposal);

      agentActionLogger.appendLog({
        description: `Payment change proposals created.`,
        actionName: "create_payment",
        actionType: AgentActionType.TOOL_CALL_RESPONSE,
        relationId: config.toolCall.id,
        runId: run_id,
        tags: [AgentLogEventTag.DATA_CHANGE_PROPOSAL],
      });

      return {
        instructions: `
These are the pending data change proposals. You can use them to approve the based on the confirmation of the user.
${startDate ? `The change will be effective on ${startDate}` : ""}
`,
        dataChangeProposals: [dataChangeProposal].map((proposal) => ({
          id: proposal.id,
          description: proposal.description,
        })),
      };
    },
    {
      name: "create_payment",
      description:
        "Create a new payment for an employee. Payments include bonuses, extra payments, and regular payments. There are multiple properties that can be changed. Only change the ones mentioned in the request. You can use the change_payment_details tool to change the properties of an existing payment.",
      schema: z.object({
        quote: z
          .string()
          .describe(
            "Quoted phrase from the user mentioning the change. Please use the sanitize_quote_for_proposal tool to refine the quote.",
          ),
        employeeId: z.string(),
        contractId: z.string(),
        title: z.string(),
        paymentType: z.enum(
          ctx.extendedContext?.paymentTypes.map(
            (paymentType) => paymentType.slug,
          ) as [string, ...string[]],
        ),
        amount: z.number().optional(),
        monthlyHours: z.number().optional(),
        frequency: z.nativeEnum(PaymentFrequency).optional(),
        startDate: z
          .string()
          .optional()
          .describe(
            "The date on which the change should be effective. Only define if user mentions a date. YYYY-MM-DD format",
          ),
      }),
    },
  );

function paymentTypeToId(
  paymentType: PaymentType["slug"],
  paymentTypes: Array<PaymentType>,
) {
  return paymentTypes.find((type) => type.slug === paymentType)?.id;
}

function parseStartDate(startDate: string | undefined) {
  if (!startDate) {
    // today at 00:00:00.000 UTC
    const now = new Date();
    const utcDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    return {
      startDate: utcDate.toISOString(),
    };
  }
  return { startDate: new Date(startDate).toISOString() };
}
