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
import { promptService } from "../../../services/prompts/prompt.service";
import { createGraphQLClient } from "../../../utils/graphql/client.js";
import { getPaymentsOfEmployee } from "../../get-payments-of-employee/tool.js";
import {
  ToolFactoryToolDefintion,
  toolFactory,
  ToolContext,
} from "../../tool-factory.js";
import {
  PaymentType,
  ExtendedToolContext,
} from "../data-change-engine/tool.js";
import { findEmployeeByNameWithContract } from "../data-change-engine/tools/find-employee-by-name-with-contract/tool.js";
import { getCurrentDataChangeProposals } from "../data-change-engine/tools/get-current-data-change-proposals/tool.js";
import { correctPaymentChange } from "./tools/correct-payment-change.js";
import { correctPaymentCreation } from "./tools/correct-payment-creation.js";
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
        iteration: originalProposal.iteration || 1,
        hasPreviousIterations: !!originalProposal.previousIterations,
        previousIterationsCount:
          originalProposal.previousIterations?.length || 0,
      });

      // Strip out previousIterations to avoid bloating LLM context
      // We only need the current proposal state
      const {
        previousIterations: _previousIterations,
        ...proposalWithoutHistory
      } = originalProposal;

      // Extract paymentId from mutationQuery if this is a "change" type proposal
      let extractedPaymentId: string | undefined;
      if (
        originalProposal.changeType === "change" &&
        originalProposal.mutationQuery
      ) {
        const mutationVariables = originalProposal.mutationQuery.variables;
        if (mutationVariables?.data?.id) {
          extractedPaymentId = mutationVariables.data.id;
          logger.debug("Extracted paymentId from mutationQuery", {
            paymentId: extractedPaymentId,
          });
        }
      }

      logger.debug(
        "Building correction prompt with cleaned proposal (removed previousIterations)",
      );

      // Fetch prompt from LangSmith
      const rawPrompt = await promptService.getRawPromptTemplateOrThrow({
        promptName: "ritagraph-data-correction-engine",
      });
      const systemPrompt = await PromptTemplate.fromTemplate(
        rawPrompt.template,
      ).format({
        originalProposalJson: JSON.stringify(proposalWithoutHistory, null, 2),
        correctionRequest,
        proposalId: originalProposal.id,
        changeType: originalProposal.changeType,
        paymentIdInfo: extractedPaymentId
          ? `PaymentId: ${extractedPaymentId}`
          : "",
        paymentIdInstruction: extractedPaymentId
          ? `"${extractedPaymentId}" (from original)`
          : `<from getPaymentsOfEmployee if employee changed>`,
      });

      // Original hardcoded prompt - kept for reference
      // const systemPrompt = await PromptTemplate.fromTemplate(
      //   `## Role
      // You correct data change proposals based on user feedback.
      // ...
      // → correct_payment_change(proposalId, employeeId=360ed956..., paymentId=clrita0001, amount=4000)`,
      // ).format({
      //   originalProposalJson: JSON.stringify(proposalWithoutHistory, null, 2),
      //   correctionRequest,
      //   today: new Date().toISOString().split("T")[0],
      //   proposalId: originalProposal.id,
      //   changeType: originalProposal.changeType,
      //   paymentIdInfo: extractedPaymentId
      //     ? `PaymentId: ${extractedPaymentId}`
      //     : "",
      //   paymentIdInstruction: extractedPaymentId
      //     ? `"${extractedPaymentId}" (from original)`
      //     : `<from getPaymentsOfEmployee if employee changed>`,
      // });

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
        correctPaymentChange,
        correctPaymentCreation,
      ];

      logger.debug("Initializing tools for correction agent", {
        toolCount: toolDefinitions.length,
      });

      const tools = toolFactory<
        Omit<ExtendedToolContext, "originalMessageChain" | "preferredLanguage">
      >({
        toolDefinitions,
        ctx: {
          ...toolContext,
          extendedContext: {
            paymentTypes,
          },
        },
      });

      logger.info("Invoking correction agent with React pattern", {
        changeType: originalProposal.changeType,
        proposalId: originalProposal.id,
        hasPaymentId: !!(originalProposal as any).paymentId,
      });

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

async function getPaymentTypes(
  toolContext: ToolContext,
): Promise<Array<PaymentType>> {
  const graphqlClient = createGraphQLClient(toolContext);

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
