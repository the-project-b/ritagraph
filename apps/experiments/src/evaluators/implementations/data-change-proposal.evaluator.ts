/* eslint-disable @typescript-eslint/no-explicit-any */
import { createEvaluationLogger } from "../core/evaluation-context.js";
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
  ProposalWithMetadata,
  compareProposalSets,
  logProposalDetails,
  normalizeProposal,
} from "../helpers/proposal-comparison.js";
import { ProposalFormatter } from "../helpers/proposal-formatter.js";
import {
  ValidationConfig,
  applyAddTransformers,
  mergeValidationConfigs,
} from "../helpers/validation-config.js";
import { DEFAULT_TRANSFORMER_MAPPINGS } from "../helpers/transformer-registry.js";
import { DataChangeProposal } from "./types.js";

// Create logger instance with evaluation context
const logger = createEvaluationLogger(
  "experiments",
  "DataChangeProposalEvaluator",
);

/**
 * Default validation configuration for data change proposals.
 * Uses transformer registry keys instead of inline functions.
 */
function getDefaultValidationConfig(): ValidationConfig {
  return {
    normalization: [
      {
        when: "change",
        fields: {
          changeType: "__literal__",
          changedField: "changedField",
          newValue: "newValue",
          relatedUserId: "relatedUserId",
          mutationQueryPropertyPath: "mutationQuery.propertyPath",
          mutationVariables: "mutationQuery.variables",
        },
      },
      {
        when: "creation",
        fields: {
          changeType: "__literal__",
          relatedUserId: "relatedUserId",
          mutationVariables: "mutationQuery.variables",
        },
      },
    ],

    ignorePaths: [],

    transformers: DEFAULT_TRANSFORMER_MAPPINGS,
  };
}

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
    | Array<ProposalWithMetadata | NormalizedProposal>
    | ProposalWithMetadata
    | NormalizedProposal;
  readonly validationConfig?: ValidationConfig;
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
    try {
      const { referenceKey } = options;

      // Extract the expected data proposals from reference outputs
      let expectedProposals: (ProposalWithMetadata | NormalizedProposal)[] = [];
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

      // Debug: Log the raw structure of first proposal
      if (expectedProposals.length > 0) {
        logger.debug("Raw expected proposal structure", {
          operation: "evaluate.rawProposal",
          keys: Object.keys(expectedProposals[0]),
          hasIgnorePaths: "ignorePaths" in expectedProposals[0],
          ignorePaths: (expectedProposals[0] as any).ignorePaths,
        });
      }

      // Get validation config - use provided or default
      const validationConfig =
        params.referenceOutputs?.validationConfig ||
        getDefaultValidationConfig();

      // Extract actual data change proposals from outputs EARLY
      // We need them normalized for condition checking
      const actualProposals = params.outputs.dataChangeProposals || [];

      // Normalize actual proposals first
      logger.debug("Normalizing actual proposals", {
        operation: "evaluate.normalize",
        count: actualProposals.length,
        hasNormalizationConfig: !!validationConfig.normalization,
      });

      const normalizedActualProposals: NormalizedProposal[] =
        actualProposals.map((p, i) =>
          toNormalizedProposal(p, i, validationConfig),
        );

      // Expected proposals need to have changeType inferred for transformer conditions
      // They may not have explicit changeType field but we can infer it
      logger.debug("Processing expected proposals", {
        operation: "evaluate.processExpected",
        expectedCount: expectedProposals.length,
        actualCount: normalizedActualProposals.length,
        firstExpectedKeys:
          expectedProposals.length > 0 ? Object.keys(expectedProposals[0]) : [],
      });

      // Normalize expected proposals to ensure they have changeType field
      const normalizedExpectedProposals = expectedProposals.map((p) => {
        const proposal = p as any;

        // Extract per-proposal transformers and ignorePaths (Layer 3 config)
        const { transformers, ignorePaths, ...cleanProposal } = proposal;

        // If already has changeType, keep as is
        if (cleanProposal.changeType) {
          return cleanProposal as NormalizedProposal;
        }

        // Infer changeType from structure
        // If has changedField, it's a "change" type
        // Otherwise it's a "creation" type
        const inferredType = cleanProposal.changedField ? "change" : "creation";

        return {
          ...cleanProposal,
          changeType: inferredType,
        } as NormalizedProposal;
      });

      // Apply transformers to add missing fields like dates
      // Process each proposal with its own transformer configuration (three-layer system)
      logger.debug(
        "Applying transformers to expected proposals with actual conditions",
        {
          operation: "evaluate.applyTransformers",
          beforeCount: normalizedExpectedProposals.length,
          transformerCount: Object.keys(validationConfig.transformers || {})
            .length,
        },
      );

      // Apply transformers with three-layer configuration system
      const transformedExpectedProposals = expectedProposals.map(
        (originalProposal, index) => {
          const proposal = originalProposal as any;
          const normalizedProposal = normalizedExpectedProposals[index];

          // Extract per-proposal config (Layer 3)
          const {
            transformers: proposalTransformers,
            ignorePaths: proposalIgnorePaths,
            ..._
          } = proposal;

          // Merge configurations: Global (Layer 1) < Example (Layer 2) < Proposal (Layer 3)
          const mergedConfig = mergeValidationConfigs(
            getDefaultValidationConfig(),
            validationConfig,
            {
              transformers: proposalTransformers,
              ignorePaths: proposalIgnorePaths,
            },
          );

          // Apply the merged configuration
          const [transformed] = applyAddTransformers(
            [normalizedProposal],
            mergedConfig,
            true,
            normalizedActualProposals.slice(index, index + 1), // Pass corresponding actual proposal
          );

          return transformed;
        },
      );

      expectedProposals = transformedExpectedProposals;

      // Log the exact structure we receive to understand the data shape
      if (actualProposals.length > 0) {
        logger.info("Received actual proposals structure", {
          operation: "evaluate.actualStructure",
          firstProposal: actualProposals[0],
          firstProposalKeys: Object.keys(actualProposals[0] || {}),
          hasMutationVariables:
            "mutationVariables" in (actualProposals[0] || {}),
          hasMutationQuery: "mutationQuery" in (actualProposals[0] || {}),
        });
      }

      // Note: normalizedActualProposals was already created earlier for transformer conditions

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

      // Compare the proposal sets using strict matching with validation config
      const comparisonResult = compareProposalSets(
        expectedProposals,
        normalizedActualProposals,
        isDebugEnabled, // Pass debug flag to enable detailed logging
        validationConfig, // Pass validation config for strict matching with path ignoring
      );

      // Log comparison results
      logger.info("Comparison completed", {
        operation: "evaluate.comparison",
        matches: comparisonResult.matches,
        matchedCount: comparisonResult.matchedCount,
        missingCount: comparisonResult.missingInActual.length,
        unexpectedCount: comparisonResult.unexpectedInActual.length,
      });

      // Use formatter to generate clean, structured output
      // Strip metadata from expected proposals before formatting
      const cleanExpectedProposals = expectedProposals.map((p) => {
        const { ignorePaths: _ignorePaths, ...clean } = p as any;
        return clean as NormalizedProposal;
      });

      const formatter = new ProposalFormatter();
      const detailedComment = formatter.format(
        cleanExpectedProposals,
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
          matchedProposals: comparisonResult.matchedCount,
          missingProposals: comparisonResult.missingInActual.length,
          unexpectedProposals: comparisonResult.unexpectedInActual.length,
          referenceKey,
          comparisonMethod: "strict_matching_with_path_config",
        },
      };

      return evaluationResult;
    } catch (error) {
      // Log the error with full details
      logger.error("Data change proposal evaluator failed with error", {
        operation: "evaluate.error",
        evaluatorType: "DATA_CHANGE_PROPOSAL",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        referenceKey: options.referenceKey,
        hasInputs: !!params.inputs,
        hasOutputs: !!params.outputs,
        hasReferenceOutputs: !!params.referenceOutputs,
      });

      // Return a failure result with the error details
      return {
        key: "data_change_proposal_verification",
        score: 0,
        comment: `❌ Evaluation Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
} as const;

function toNormalizedProposal(
  proposal: DataChangeProposalOutputs["dataChangeProposals"][number],
  index: number,
  config?: ValidationConfig,
): NormalizedProposal {
  const normalizedProposal = normalizeProposal(proposal, config);

  logger.debug(`Normalizing actual proposal [${index}]`, {
    operation: "normalize.actual",
    index,
    changeType: proposal.changeType,
    originalKeys: Object.keys(proposal),
    normalizedKeys: Object.keys(normalizedProposal),
    hasMutationVariables: !!proposal.mutationQuery?.variables,
    mutationVariablesType: typeof proposal.mutationQuery?.variables,
  });

  return normalizedProposal;
}
