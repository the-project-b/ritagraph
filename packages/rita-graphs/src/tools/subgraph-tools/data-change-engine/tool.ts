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
// import { masterDataChangeEngine } from "../master_data_change_engine/tool";

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
    async ({ usersRequest, usersQuotedRequest, employeeName }, config) => {
      const systemPrompt = await PromptTemplate.fromTemplate(
        `
<instruction>
You are part of a payroll assistant system.
You job is it schedule data changes (mutations).
You get a vague request from the user and you have to resolve it using your tools.

1) Understand which payments already exist.
2) Think about if a new payment is needed or an existing one should be changed.
3) Schedule changes / creations

IMPORTANT: When you are done please summarize the changes and mention which data change proposals were created.
</instruction>

<notes>
IMPORTANT: Do not assign the same change to multiple payments unless clearly stated.
- Do not just create new payments if there is already a payment with the same name unless the user explicitly asks for a new payment.
- Employees can have multiple contracts and they are often directly linked by the job title. If you it is ambiguous please ask the user for clarification.
- People can have Wage and Salary so it can be fixed or hourly based payment.
- Bonuses and extra payments are likely directly addressed in the request whereas regular payments are just announced as change in amount.
- The title of a payment often reveals its not a standard payment.
- If you fail to get a user by ID double check if you used the right ID.
- If you realised you do not have any other Ids explain you are not able to find the user.
IMPORTANT: Quotes have to be refined with the sanitize_quote_for_proposal tool.

Today is the {today}
</notes>

<examples>
User: [name] worked 40 hours this month.
Means: Change of existing payment because of hours worked.
--------------
User: [name] 40 stunden.
Means: Change of existing payment in current month because of hours worked.
--------------
User: [name] gets a bonus of 100€ for the sales.
Means: Create a new bonus type payment for the specific employee.
--------------
User: Bonus anpassen für [name]
Means: Adjust existing bonus payment.
--------------
User: Amteter muss das Gehalt von 1000€ erhöht werden.
Means: Adjust existing payment.
--------------
User: Erhöhe das Gehalt von [name] auf 1000€
Means: Adjust existing payment.
</examples>
`,
      ).format({
        today: new Date().toISOString().split("T")[0],
      });

      const humanPrompt = await PromptTemplate.fromTemplate(
        `
Employee Name: {employeeName}
Users request: {usersRequest}
Exact words: {usersQuotedRequest}

Remember to put those into the sanitize_quote_for_proposal tool to get a well formatted quote.
      `,
      ).format({
        employeeName,
        usersRequest,
        usersQuotedRequest,
      });

      // We need to know the original message chain to get the well formatted quote
      const callerGraphState = (await getCurrentTaskInput(config)) as {
        messages: Array<BaseMessage>;
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
        //masterDataChangeEngine,
      ];

      if (growthbookClient.isOn("create-payments", {})) {
        toolDefinitions.push(createPayment);
      }

      const tools = toolFactory<ExtendedToolContext>({
        toolDefinitions,
        ctx: {
          ...toolContext,
          extendedContext: {
            paymentTypes,
            originalMessageChain: callerGraphState.messages,
            preferredLanguage: callerGraphState.preferredLanguage,
          },
        },
      });

      const agent = buildDataChangeEngineGraph({ tools });

      const response = await agent.invoke({
        messages: await messagePrompt.formatMessages({
          usersRequest,
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
        usersRequest: z.string().describe("What the user wants to retrieve"),
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
