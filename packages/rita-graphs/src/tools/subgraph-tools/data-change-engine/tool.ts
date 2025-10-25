import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { buildDataChangeEngineGraph } from "./sub-graph";
import {
  ToolContext,
  ToolFactoryToolDefintion,
  toolFactory,
} from "../../tool-factory";
import { getPaymentsOfEmployee } from "../../get-payments-of-employee/tool";
import { Command, getCurrentTaskInput } from "@langchain/langgraph";
import { changePaymentDetails } from "./tools/change-payment-details/tool";
import { getCurrentDataChangeProposals } from "./tools/get-current-data-change-proposals/tool";
import { findEmployeeByNameWithContract } from "./tools/find-employee-by-name-with-contract/tool";
import { createGraphQLClient } from "../../../utils/graphql/client";
import { createPaymentTool as createPayment } from "./tools/create-payment/tool";
import growthbookClient from "../../../utils/growthbook";
import { sanitizeQuoteForProposal } from "./tools/sanitize-quote-for-proposal/tool";
import { masterDataChangeEngine } from "../master_data_change_engine/tool";
import { promptService } from "../../../services/prompts/prompt.service";
import { askUserAQuestion } from "../../ask-user-a-question/tool";

export type PaymentType = {
  id: string;
  title: string;
  slug: string;
};

export type ExtendedToolContext = {
  /**
   * Payment types are useful for creating new payments. Why are we defining it arleady here?
   * The tool that we will build will need to have an enum as input that lets LLM choose from the payment types.
   * I want this enum to be written as slugs, and not ids since the LLM has to then remember the mapping of ids and slugs.
   * -> Less cognitive complexity for the LLM
   */
  paymentTypes: Array<PaymentType>;
  originalMessageChain: Array<BaseMessage>;
  preferredLanguage: "EN" | "DE";
};

/**
 * This is a special tool since it runs its own graph.
 * Wrapping this into a tool helps us to have clear segration of concerns.
 */
export const mutationEngine: ToolFactoryToolDefintion = (toolContext) =>
  tool(
    async (
      {
        usersChangeDescription,
        usersQuotedRequest,
        employeeName,
        effectiveDate,
      },
      config,
    ) => {
      const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
        promptName: "ritagraph-data-change-engine",
      });
      const systemPrompt = await PromptTemplate.fromTemplate(
        rawPrompt.template,
      ).format({
        today: new Date().toISOString().split("T")[0],
        nameOfMonth: new Date().toLocaleString("default", { month: "long" }),
      });

      const humanPrompt = await PromptTemplate.fromTemplate(
        `
Employee Name: {employeeName}
Users request: {usersChangeDescription}
Exact words: {usersQuotedRequest}
{effectiveDate}

Remember to put those into the sanitize_quote_for_proposal tool to get a well formatted quote.
      `,
      ).format({
        employeeName,
        usersChangeDescription,
        usersQuotedRequest,
        effectiveDate: `${effectiveDate ? `Effective date: ${effectiveDate}` : ""}`,
      });

      // We need to know the original message chain to get the well formatted quote
      const callerGraphState = (await getCurrentTaskInput(config)) as {
        originalMessageChain: Array<BaseMessage>;
        preferredLanguage: "EN" | "DE";
      };

      const messagePrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ]);

      // Tool related context
      const paymentTypes = await getPaymentTypes(toolContext);

      const toolDefinitions = [
        findEmployeeByNameWithContract,
        getPaymentsOfEmployee,
        getCurrentDataChangeProposals,
        changePaymentDetails,
        sanitizeQuoteForProposal,
        askUserAQuestion,
      ];

      // Payment creation uses a load on demand technique
      if (growthbookClient.isOn("create-payments", {})) {
        toolDefinitions.push(createPayment);
      }

      if (growthbookClient.isOn("master-data-changes", {})) {
        toolDefinitions.push(masterDataChangeEngine);
      }

      const tools = toolFactory<ExtendedToolContext>({
        toolDefinitions,
        ctx: {
          ...toolContext,
          extendedContext: {
            paymentTypes,
            originalMessageChain: callerGraphState.originalMessageChain,
            preferredLanguage: callerGraphState.preferredLanguage,
          },
        },
      });

      const agent = buildDataChangeEngineGraph({ tools });

      const response = await agent.invoke({
        messages: await messagePrompt.formatMessages({
          usersChangeDescription,
        }),
      });

      return new Command({
        update: {
          messages: [
            new ToolMessage({
              content: response.messages[response.messages.length - 1].content,
              tool_call_id: config.toolCall.id,
            }),
          ],
        },
      });
    },
    {
      name: "data_change_engine",
      description:
        "Takes a description of the data change and resolves it into a list of data change proposals that can be approved by the user. It is better to call this tool mutliple times for each employee that has changes. If the job title was mentioned please include it.",
      schema: z.object({
        employeeName: z
          .string()
          .describe("The name of the employee whose data will be changed"),
        usersChangeDescription: z
          .string()
          .describe(
            "What the user wants to change (including effective date if mentioned)",
          ),
        effectiveDate: z
          .string()
          .describe(
            "Text form (users words) of when the change should be effective. If not mentioned leave blank.",
          )
          .optional(),
        usersQuotedRequest: z
          .string()
          .describe(
            'Word for word quote of what the user said. IMPORTANT. Ommited parts from the original can be indicated with "[...]" but all relevant parts should be included. E.g. Starting september [...] Robby works 20 hours [...] (Software Architect contract)',
          ),
      }),
    },
  );

async function getPaymentTypes(
  toolContext: ToolContext,
): Promise<Array<PaymentType>> {
  const graphqlClient = createGraphQLClient({
    accessToken: toolContext.accessToken,
    appdataHeader: toolContext.appdataHeader,
  });

  try {
    const { paymentTypes } =
      await graphqlClient.getPaymentTypesForDataChangeEngine({
        data: {
          companyId: toolContext.selectedCompanyId,
        },
      });

    return paymentTypes.map((paymentType) => ({
      id: paymentType.id,
      title: paymentType.name,
      slug: paymentType.slug,
    }));
  } catch (error) {
    console.warn(
      "Failed to get payment types - gracefully returning empty array",
      error,
    );
    return [];
  }
}
