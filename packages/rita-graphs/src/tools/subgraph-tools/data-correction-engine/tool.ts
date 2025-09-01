import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { PromptTemplate } from "@langchain/core/prompts";
import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { createLogger } from "@the-project-b/logging";
import { z } from "zod";
import { createGraphQLClient } from "../../../utils/graphql/client.js";
import { getPaymentsOfEmployee } from "../../get-payments-of-employee/tool.js";
import { ToolFactoryToolDefintion, toolFactory } from "../../tool-factory.js";
import {
  ExtendedToolContext,
  PaymentType,
} from "../data-change-engine/tool.js";
import { changePaymentDetails } from "../data-change-engine/tools/change-payment-details/tool.js";
import { createPaymentTool } from "../data-change-engine/tools/create-payment/tool.js";
import { findEmployeeByNameWithContract } from "../data-change-engine/tools/find-employee-by-name-with-contract/tool.js";
import { getCurrentDataChangeProposals } from "../data-change-engine/tools/get-current-data-change-proposals/tool.js";
import { buildDataCorrectionEngineGraph } from "./sub-graph.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "DataCorrectionEngine",
  tool: "correctionEngine",
});

export const correctionEngine: ToolFactoryToolDefintion = (toolContext) =>
  tool(
    async ({ originalProposal, correctionRequest, threadId }, config) => {
      logger.info("Starting correction engine", {
        proposalId: originalProposal.id,
        threadId,
        correctionRequest,
        originalDescription: originalProposal.description,
      });

      logger.debug("Building correction prompt with original proposal context");

      const systemPrompt = await PromptTemplate.fromTemplate(
        `
<instruction>
You are correcting a previously created data change proposal based on user feedback.

<original_proposal>
{originalProposalJson}
</original_proposal>

The user has requested the following correction:
{correctionRequest}

Your job is to:
1. Understand what needs to be corrected from the original proposal
2. Determine if the correction changes the fundamental nature of the proposal:
   - From "change" to "creation": User wants to create a NEW payment instead of changing an existing one
   - From "creation" to "change": User wants to modify an EXISTING payment instead of creating a new one
3. If the employee needs to change, find the new employee using findEmployeeByNameWithContract
4. If the amount needs to change, update it accordingly
5. If the effective date needs to change, parse it correctly (today is {today})
6. Choose the correct tool based on the correction:
   - Use change_payment_details for modifying existing payments (changeType: "change")
   - Use create_payment for creating new payments (changeType: "creation")

IMPORTANT:
- Extract the original quote from the proposal and reuse it unless the correction changes what was quoted
- If changing the employee, you MUST find their contract and payment IDs first using the appropriate tools
- If changing the effective date, ensure it's in YYYY-MM-DD format
- ALWAYS pass existingProposalId: "{proposalId}" to either tool
- The tool will return the corrected proposal without saving to database
- If user says "make it a bonus" or "create a new payment" or similar, use create_payment
- If user says "update the existing payment" or similar, use change_payment_details
</instruction>

<examples>
Original: Change amount of payment Liam Davis to 3000
Correction: "I meant 4000"
Action: Use change_payment_details with same employee/contract/payment IDs but amount=4000

Original: Change amount of payment Liam Davis to 3000
Correction: "I meant Olivia, not Liam"
Action: First find Olivia's employee ID, contract ID, and payment ID, then use change_payment_details with Olivia's IDs

Original: Change amount of payment Liam Davis to 3000 effective 2025-10-01
Correction: "I meant starting on the 20th"
Action: Use change_payment_details with same IDs but effectiveDate="2025-10-20"

Original: Change amount of payment Liam Davis to 3000
Correction: "Actually make it a new bonus payment instead"
Action: Use create_payment with title="Bonus", paymentType="bonus", amount=3000

Original: Create new bonus payment for Liam Davis of 2000
Correction: "Actually just update his existing salary to 2000"
Action: First find Liam's payment IDs, then use change_payment_details with amount=2000
</examples>
`,
      ).format({
        originalProposalJson: JSON.stringify(originalProposal, null, 2),
        correctionRequest,
        today: new Date().toISOString().split("T")[0],
        proposalId: originalProposal.id,
      });

      const humanPrompt = await PromptTemplate.fromTemplate(
        `Please correct this proposal: {correctionRequest}`,
      ).format({
        correctionRequest,
      });

      logger.debug("Fetching payment types for tool context");
      logger.debug("Fetching payment types for tool context");
      const paymentTypes = await getPaymentTypes(toolContext);
      logger.debug("Payment types fetched", { count: paymentTypes.length });
      const toolDefinitions = [
        findEmployeeByNameWithContract,
        getPaymentsOfEmployee,
        getCurrentDataChangeProposals,
        changePaymentDetails,
        createPaymentTool,
      ];


      logger.debug("Initializing tools for correction agent", {
        toolCount: toolDefinitions.length,
      });

      const tools = toolFactory<ExtendedToolContext>({
        toolDefinitions,
        ctx: {
          ...toolContext,
          extendedContext: {
            paymentTypes,
          },
        },
      });

      logger.info("Invoking correction agent with React pattern");
      const agent = buildDataCorrectionEngineGraph({ tools });

      const response = await agent.invoke(
        {
          messages: [
            new SystemMessage(systemPrompt),
            new HumanMessage(humanPrompt),
          ],
        },
        {
          configurable: {
            thread_id: threadId,
            run_id: config.configurable.run_id,
          },
        },
      );

      const lastMessage = response.messages[response.messages.length - 1];
      logger.debug("Agent completed processing", {
        messageCount: response.messages.length,
      });

      let correctedProposal = null;
      let toolResponseMessage = null;

      for (const message of response.messages) {
        if (message instanceof ToolMessage && message.content) {
          try {
            const content =
              typeof message.content === "string"
                ? JSON.parse(message.content)
                : message.content;

            if (content.correctedProposal) {
              correctedProposal = content.correctedProposal;
              toolResponseMessage =
                content.message || "Proposal corrected successfully";
              logger.info("Found corrected proposal in tool response", {
                proposalId: correctedProposal.id,
                description: correctedProposal.description,
              });
              break;
            }
          } catch (e) {
            logger.debug("Tool message did not contain corrected proposal", {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      if (!correctedProposal) {
        logger.warn("No corrected proposal found in agent response");
        return new Command({
          update: {
            messages: [
              new ToolMessage({
                content:
                  "Failed to create a corrected proposal. The agent did not return a corrected proposal.",
                tool_call_id: config.toolCall.id,
              }),
            ],
          },
        });
      }

      logger.info("Successfully extracted corrected proposal", {
        proposalId: correctedProposal.id,
        description: correctedProposal.description,
      });

      return new Command({
        update: {
          messages: [
            new ToolMessage({
              content: toolResponseMessage || lastMessage.content,
              tool_call_id: config.toolCall.id,
            }),
          ],
          correctedProposal,
        },
      });
    },
    {
      name: "data_correction_engine",
      description:
        "Corrects an existing data change proposal based on user feedback. It re-processes the proposal with corrections to employee, amount, date, or other details.",
      schema: z.object({
        originalProposal: z
          .any()
          .describe("The original data change proposal object to correct"),
        correctionRequest: z
          .string()
          .describe(
            "The user's correction request describing what needs to be changed",
          ),
        threadId: z.string().describe("The LangGraph thread ID"),
      }),
    },
  );

async function getPaymentTypes(toolContext: any): Promise<Array<PaymentType>> {
  const graphqlClient = createGraphQLClient({
    accessToken: toolContext.accessToken,
    appdataHeader: toolContext.appdataHeader,
  });

  try {
    if (!toolContext.selectedCompanyId) {
      logger.warn("No company ID provided, cannot fetch payment types");
      return [];
    }

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
    logger.warn("Failed to get payment types, returning empty array", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
