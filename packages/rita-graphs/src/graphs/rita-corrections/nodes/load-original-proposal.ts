import { createLogger } from "@the-project-b/logging";
import { Node, AssumedConfigType } from "../graph-state.js";
import { createGraphQLClient } from "../../../utils/graphql/client.js";
import { DataChangeProposal } from "../../shared-types/base-annotation.js";
import { CorrectionStatus } from "../types.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "RitaCorrections",
  node: "loadOriginalProposal",
});

export const loadOriginalProposal: Node = async (
  state,
  config,
  getAuthUser,
) => {
  const { originalProposalId, correctionRequest, selectedCompanyId } = state;
  const { thread_id: threadId } =
    config.configurable as unknown as AssumedConfigType;

  logger.info("Loading original proposal", {
    operation: "loadOriginalProposal",
    proposalId: originalProposalId,
    threadId,
    companyId: selectedCompanyId,
  });

  if (!originalProposalId) {
    logger.error("No proposal ID provided in state", {
      threadId,
    });
    return {
      correctionStatus: CorrectionStatus.FAILED,
    };
  }

  if (!correctionRequest) {
    logger.error("No correction request provided in state", {
      threadId,
      proposalId: originalProposalId,
    });
    return {
      correctionStatus: CorrectionStatus.FAILED,
    };
  }

  try {
    const { token: accessToken, appdataHeader } = getAuthUser(config);
    const client = createGraphQLClient({
      accessToken,
      appdataHeader,
    });

    logger.debug("Querying thread items to find proposal", {
      threadId,
      proposalId: originalProposalId,
    });
    const { threadByLanggraphId } =
      await client.getThreadItemsByLanggraphThreadId({
        langgraphId: threadId,
      });

    if (!threadByLanggraphId?.threadItems) {
      throw new Error("Thread not found or has no items");
    }

    logger.debug("Searching for thread item", {
      totalItems: threadByLanggraphId.threadItems.length,
      targetId: originalProposalId,
    });
    const threadItem = threadByLanggraphId.threadItems.find(
      (item) => String(item.id) === originalProposalId,
    );

    if (!threadItem) {
      throw new Error(`Thread item with ID ${originalProposalId} not found`);
    }

    if (threadItem.data?.type !== "DATA_CHANGE_PROPOSAL") {
      throw new Error(
        `Thread item ${originalProposalId} is not a data change proposal (type: ${threadItem.data?.type})`,
      );
    }

    const originalProposal = threadItem.data.proposal as DataChangeProposal;

    if (!originalProposal) {
      throw new Error("Thread item does not contain a valid proposal");
    }

    logger.info("Successfully loaded original proposal", {
      proposalId: originalProposal.id,
      proposalType: originalProposal.changeType,
      description: originalProposal.description,
      status: originalProposal.status,
      iteration: originalProposal.iteration || 1,
      hasPreviousIterations: !!originalProposal.previousIterations,
      previousIterationsCount: originalProposal.previousIterations?.length || 0,
    });

    return {
      originalProposal,
      correctionStatus: CorrectionStatus.PROCESSING,
    };
  } catch (error) {
    logger.error("Failed to load original proposal", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      proposalId: originalProposalId,
      threadId,
    });

    return {
      correctionStatus: CorrectionStatus.FAILED,
    };
  }
};
