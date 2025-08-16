/* eslint-disable @typescript-eslint/no-explicit-any */
import { createLogger } from "@the-project-b/logging";
import {
  EvaluationOptions,
  EvaluatorParams,
  EvaluationResult,
  TextEvaluationInputs,
  TextEvaluationOutputs,
  TypedEvaluator,
} from "../core/types.js";
import {
  NormalizedProposal,
  compareProposalSets,
  logProposalDetails,
} from "../helpers/proposal-comparison.js";
import { ProposalFormatter } from "../helpers/proposal-formatter.js";
import { substituteSituationAwareExpectedValues } from "../helpers/situation-aware.js";
import { DataChangeProposal } from "./types.js";

// Create logger instance
const logger = createLogger({ service: "experiments" }).child({
  module: "DataChangeProposalEvaluator",
});

// Define the specific types for this evaluator
interface DataChangeProposalInputs extends TextEvaluationInputs {
  readonly question: string;
}

interface DataChangeProposalOutputs extends TextEvaluationOutputs {
  readonly answer: string;
  readonly dataChangeProposals?: Array<DataChangeProposal>;
}

interface DataChangeProposalReferenceOutputs {
  readonly expectedDataProposal?:
    | Array<NormalizedProposal>
    | NormalizedProposal;
}

export const dataChangeProposalEvaluator: TypedEvaluator<
  "DATA_CHANGE_PROPOSAL",
  DataChangeProposalInputs,
  DataChangeProposalOutputs,
  DataChangeProposalReferenceOutputs
> = {
  config: {
    type: "DATA_CHANGE_PROPOSAL",
    name: "Data Change Proposal Verification",
    description:
      "Verifies that the generated data change proposals match the expected proposal structure and values (including mutationVariables) using deterministic hash comparison",
    defaultModel: "openai:gpt-4o", // Not used but kept for interface compatibility
    supportsCustomPrompt: false, // No LLM involved
    supportsReferenceKey: true,
    requiredReferenceKeys: ["expectedDataProposal"], // Only run when expectedDataProposal exists in reference outputs
  } as const,

  async evaluate(
    params: EvaluatorParams<
      DataChangeProposalInputs,
      DataChangeProposalOutputs,
      DataChangeProposalReferenceOutputs
    >,
    options: EvaluationOptions = {},
  ): Promise<EvaluationResult> {
    const { referenceKey } = options;

    // Extract the expected data proposals from reference outputs
    let expectedProposals: NormalizedProposal[] = [];
    const key = referenceKey || "expectedDataProposal";

    // Check if the required key exists (should already be checked by factory, but double-check here)
    if (!params.referenceOutputs || !params.referenceOutputs[key]) {
      // This shouldn't happen if factory is working correctly, but log just in case
      logger.warn(
        `[DataChangeProposalEvaluator] Required reference key '${key}' not found. This should have been caught by factory.`,
        {
          operation: "evaluate",
          evaluatorType: "DATA_CHANGE_PROPOSAL",
          requestedKey: key,
          hasReferenceOutputs: !!params.referenceOutputs,
          availableKeys: params.referenceOutputs
            ? Object.keys(params.referenceOutputs)
            : [],
          isCustomKey: referenceKey !== undefined,
          hasQuestion: !!params.inputs?.question,
          hasAnswer: !!params.outputs?.answer,
          hasDataChangeProposals: !!params.outputs?.dataChangeProposals,
        },
      );
      // Return a skip result
      return {
        key: "data_change_proposal_verification",
        score: 0,
        comment: `Error: Required reference key '${key}' not found`,
      };
    }

    const referenceValue = params.referenceOutputs[key];

    // Normalize expected proposals to always be an array
    expectedProposals = Array.isArray(referenceValue)
      ? referenceValue
      : [referenceValue];

    // Apply situation-aware substitutions to expected values
    expectedProposals =
      substituteSituationAwareExpectedValues(expectedProposals);

    logger.debug("Expected proposals", {
      operation: "normalize.expected",
      count: expectedProposals.length,
      firstProposal: expectedProposals[0],
    });

    logger.debug("Expected proposals normalized", {
      operation: "normalize.expected",
      isArray: Array.isArray(referenceValue),
      count: expectedProposals.length,
      firstProposal: expectedProposals[0],
    });

    // Extract actual data change proposals from outputs
    const actualProposals = params.outputs.dataChangeProposals || [];

    // Log the exact structure we receive to understand the data shape
    if (actualProposals.length > 0) {
      logger.info("Received actual proposals structure", {
        operation: "evaluate.actualStructure",
        firstProposal: actualProposals[0],
        firstProposalKeys: Object.keys(actualProposals[0] || {}),
        hasMutationVariables: "mutationVariables" in (actualProposals[0] || {}),
        hasMutationQuery: "mutationQuery" in (actualProposals[0] || {}),
      });
    }

    // Extract only the static fields for comparison
    const normalizedActualProposals: NormalizedProposal[] =
      actualProposals.map(toNormalizedProposal);

    // Comprehensive logging for debugging
    logger.info("Starting proposal comparison", {
      operation: "evaluate.start",
      expectedCount: expectedProposals.length,
      actualCount: normalizedActualProposals.length,
      referenceKey: key,
    });

    // Log detailed information about proposals if debug logging is enabled
    const isDebugEnabled = process.env.LOG_LEVEL === "debug";
    if (isDebugEnabled) {
      logProposalDetails(expectedProposals, "expected", key);
      logProposalDetails(normalizedActualProposals, "actual", key);
    }

    // Compare the proposal sets using hash comparison
    const comparisonResult = compareProposalSets(
      expectedProposals,
      normalizedActualProposals,
      isDebugEnabled, // Pass debug flag to enable detailed logging
    );

    // Log comparison results
    logger.info("Comparison completed", {
      operation: "evaluate.comparison",
      matches: comparisonResult.matches,
      expectedHashCount: comparisonResult.expectedHashes.size,
      actualHashCount: comparisonResult.actualHashes.size,
      missingCount: comparisonResult.missingInActual.length,
      unexpectedCount: comparisonResult.unexpectedInActual.length,
      missingHashes: comparisonResult.missingInActual,
      unexpectedHashes: comparisonResult.unexpectedInActual,
    });

    // Use formatter to generate clean, structured output
    const formatter = new ProposalFormatter();
    const detailedComment = formatter.format(
      expectedProposals,
      normalizedActualProposals,
      comparisonResult,
    );

    // Return binary score: 1 for match, 0 for mismatch
    const evaluationResult = {
      key: "data_change_proposal_verification",
      score: comparisonResult.matches ? 1 : 0,
      comment: detailedComment,
      // Store detailed information in the value field as an object
      value: {
        expectedProposalCount: expectedProposals.length,
        actualProposalCount: normalizedActualProposals.length,
        expectedHashes: Array.from(comparisonResult.expectedHashes),
        actualHashes: Array.from(comparisonResult.actualHashes),
        missingProposals: comparisonResult.missingInActual.length,
        unexpectedProposals: comparisonResult.unexpectedInActual.length,
        referenceKey,
        comparisonMethod: "md5_hash_with_mutation_variables",
      },
    };

    return evaluationResult;
  },
} as const;

function toNormalizedProposal(
  proposal: DataChangeProposalOutputs["dataChangeProposals"][number],
  index: number,
): NormalizedProposal {
  if (proposal.changeType === "creation") {
    throw new Error("Creation proposals are not supported yet");
  }

  // The actual proposals from evaluation-job-manager already have mutationVariables at top level
  const normalized: NormalizedProposal = {
    changeType: proposal.changeType,
    changedField: proposal.changedField,
    newValue: proposal.newValue,
    mutationQueryPropertyPath: proposal.mutationQuery?.propertyPath,
    relatedUserId: proposal.relatedUserId,
    mutationVariables: proposal.mutationQuery?.variables, // Already at top level from extraction
  };

  logger.info(`Normalizing actual proposal [${index}]`, {
    operation: "normalize.actual",
    index,
    original: proposal,
    normalized,
    hasMutationVariables: !!proposal.mutationQuery?.variables,
    mutationVariablesType: typeof proposal.mutationQuery?.variables,
  });

  return normalized;
}
