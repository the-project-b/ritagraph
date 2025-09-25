import { AIMessage } from "@langchain/core/messages";
import { createLogger } from "@the-project-b/logging";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { Node, AssumedConfigType } from "../graph-state.js";
import { createGraphQLClient } from "../../../utils/graphql/client.js";
import { toolFactory } from "../../../tools/tool-factory.js";
import { correctionEngine } from "../../../tools/subgraph-tools/data-correction-engine/tool.js";
import { Tags } from "../../tags.js";
import { DataChangeProposal } from "../../shared-types/base-annotation.js";
import { BASE_MODEL_CONFIG } from "../../model-config.js";
import { CorrectionStatus } from "../types.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "RitaCorrections",
  node: "processCorrection",
});

const CorrectionSummarySchema = z.object({
  summary: z
    .string()
    .max(60)
    .describe("A concise summary of what changed, max 60 characters"),
});

type CorrectionSummary = z.infer<typeof CorrectionSummarySchema>;
export const processCorrection: Node = async (state, config, getAuthUser) => {
  const {
    originalProposal,
    originalProposalId,
    correctionRequest,
    selectedCompanyId,
    agentActionLogger,
  } = state;
  const { run_id, thread_id } =
    config.configurable as unknown as AssumedConfigType;

  logger.info("Processing correction", {
    proposalId: originalProposal?.id,
    correctionRequest,
    companyId: selectedCompanyId,
  });

  if (!originalProposal) {
    logger.error("No original proposal to correct", {
      proposalId: originalProposalId,
      threadId: thread_id,
    });
    return {
      correctionStatus: CorrectionStatus.FAILED,
    };
  }

  try {
    const authContext = getAuthUser(config);
    const { token: accessToken, appdataHeader } = authContext;

    logger.debug("Preparing correction engine with auth context", {
      hasToken: !!accessToken,
      companyId: selectedCompanyId,
    });
    const tools = toolFactory({
      toolDefinitions: [correctionEngine],
      ctx: {
        accessToken,
        appdataHeader,
        agentActionLogger,
        selectedCompanyId,
      },
    });

    logger.info("Invoking correction engine tool", {
      originalProposalId,
      toolName: "data_correction_engine",
      proposalIteration: originalProposal.iteration || 1,
      hasPreviousIterations: !!originalProposal.previousIterations,
      previousIterationsCount: originalProposal.previousIterations?.length || 0,
    });
    const correctionTool = tools[0];
    const result = await correctionTool.invoke(
      {
        originalProposal,
        correctionRequest,
        threadId: thread_id,
      },
      {
        configurable: {
          run_id,
          thread_id,
        },
        toolCall: {
          id: `correction_${originalProposalId}`,
          name: "data_correction_engine",
          args: {
            originalProposal,
            correctionRequest,
            threadId: thread_id,
          },
        },
      },
    );

    logger.debug("Correction engine returned result", {
      hasUpdate: !!result.update,
      hasCorrectedProposal: !!result.update?.correctedProposal,
    });

    const correctedProposal = result.update?.correctedProposal;

    if (!correctedProposal) {
      throw new Error("Correction engine did not return a corrected proposal");
    }

    logger.info(
      "Updating original proposal with corrected data and versioning",
      {
        originalId: originalProposal.id,
        correctedDescription: correctedProposal.description,
        currentIteration: originalProposal.iteration || 1,
      },
    );

    const client = createGraphQLClient({
      accessToken,
      appdataHeader,
    });
    const updateResult = await client.updateRitaThreadItem({
      input: {
        id: parseInt(originalProposalId, 10),
        data: {
          type: "DATA_CHANGE_PROPOSAL",
          proposal: correctedProposal,
        },
      },
    });

    if (!updateResult.updateRitaThreadItem) {
      throw new Error("Failed to update proposal in database");
    }

    const correctionSummary = await generateCorrectionSummary(
      originalProposal,
      correctedProposal,
      correctionRequest,
    );

    logger.info("Correction completed successfully", {
      proposalId: originalProposal.id,
      summary: correctionSummary,
    });

    return {
      correctedProposal,
      correctionStatus: CorrectionStatus.COMPLETED,
      correctionResponseDraft: correctionSummary,
      messages: [
        ...state.messages,
        new AIMessage(correctionSummary, {
          tags: [Tags.CORRECTION_APPLIED],
        }),
      ],
    };
  } catch (error) {
    logger.error("Correction processing failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      proposalId: originalProposal?.id,
      threadId: thread_id,
    });

    return {
      correctionStatus: CorrectionStatus.FAILED,
    };
  }
};

async function generateCorrectionSummary(
  originalProposal: DataChangeProposal,
  correctedProposal: DataChangeProposal,
  correctionRequest: string,
): Promise<string> {
  try {
    const llm = new ChatOpenAI({
      ...BASE_MODEL_CONFIG,
      temperature: 0.1,
      tags: [Tags.CORRECTION_APPLIED],
    });

    const prompt = await ChatPromptTemplate.fromMessages([
      [
        "system",
        `Generate a very concise summary of this correction.

Original proposal: "{originalDescription}"
Corrected proposal: "{correctedDescription}"
Correction request: "{correctionRequest}"

Provide a short, visual-friendly summary (like "Changed amount from 3000 to 4000" or "Changed employee to Olivia").
Focus on what actually changed. Be specific but concise.
Do NOT include fluff words or complete sentences.`,
      ],
    ]).invoke({
      originalDescription: originalProposal.description,
      correctedDescription: correctedProposal.description,
      correctionRequest,
    });

    const response = await llm
      .withStructuredOutput<CorrectionSummary>(CorrectionSummarySchema)
      .invoke(prompt);

    logger.debug("Generated correction summary", {
      summary: response.summary,
      iteration: correctedProposal.iteration,
    });

    return response.summary;
  } catch (error) {
    logger.warn("Failed to generate correction summary, using fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return `Corrected proposal v${correctedProposal.iteration || 2}`;
  }
}
