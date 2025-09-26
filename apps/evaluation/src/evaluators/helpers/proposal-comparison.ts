import { createEvaluationLogger } from "../core/evaluation-context.js";
import { canonicalizeObject } from "./canonical-json.js";
import { DataChangeProposal } from "../implementations/types.js";
import {
  ValidationConfig,
  shouldIgnorePath,
  applyTransformer,
  normalizeWithConfig,
} from "./validation-config.js";
import { deepEquals } from "./object-utils.js";

// Re-export canonicalizeObject for use in other modules
export { canonicalizeObject } from "./canonical-json.js";

const logger = createEvaluationLogger("experiments", "ProposalComparison");

/**
 * Normalized structure for data change proposals
 */
export type NormalizedProposal =
  | {
      changeType: "creation";
      relatedUserId?: string;
      mutationVariables?: any;
    }
  | {
      changeType: "change";
      changedField: string;
      newValue: string;
      mutationQueryPropertyPath?: string;
      relatedUserId?: string;
      mutationVariables?: any;
    };

/**
 * Proposal with optional validation metadata
 * This is used for test data where we can override validation config per proposal
 */
export type ProposalWithMetadata = NormalizedProposal & {
  ignorePaths?: string[] | string;
  transformers?: Record<string, string>;
};

/**
 * Normalizes a proposal to ensure consistent types and values.
 * Uses ValidationConfig if provided, otherwise falls back to legacy behavior.
 *
 * @param proposal - The proposal to normalize
 * @param config - Optional validation config with normalization rules
 * @returns A normalized proposal with consistent types
 */
export function normalizeProposal(
  proposal: DataChangeProposal,
  config?: ValidationConfig,
): NormalizedProposal {
  // If config has normalization rules, use them
  if (config?.normalization) {
    return normalizeWithConfig(proposal, config) as NormalizedProposal;
  }

  // Legacy normalization for backward compatibility
  if (proposal.changeType === "creation") {
    return {
      changeType: "creation",
      relatedUserId: proposal.relatedUserId,
      mutationVariables: proposal.mutationQuery?.variables,
    };
  }

  return {
    changeType: "change",
    changedField: proposal.changedField,
    newValue: proposal.newValue,
    mutationQueryPropertyPath: proposal.mutationQuery?.propertyPath,
    relatedUserId: proposal.relatedUserId,
    mutationVariables: proposal.mutationQuery?.variables,
  };
}

/**
 * Result of comparing two sets of proposals
 */
export interface ProposalComparisonResult {
  matches: boolean;
  missingInActual: NormalizedProposal[];
  unexpectedInActual: NormalizedProposal[];
  matchedCount: number;
}

/**
 * Extracts validation overrides from a proposal and creates a merged config
 */
function getMergedConfig(
  proposal: ProposalWithMetadata | NormalizedProposal,
  baseConfig?: ValidationConfig,
): ValidationConfig | undefined {
  const proposalWithMeta = proposal as ProposalWithMetadata;
  const proposalIgnorePathsRaw = proposalWithMeta.ignorePaths;
  const proposalTransformers = proposalWithMeta.transformers;

  const hasIgnoreOverride = proposalIgnorePathsRaw !== undefined;
  const hasTransformerOverride = proposalTransformers !== undefined;

  if (!hasIgnoreOverride && !hasTransformerOverride) {
    return baseConfig;
  }

  const mergedConfig: ValidationConfig = {
    ...baseConfig,
    ignorePaths: baseConfig?.ignorePaths || [],
    transformers: baseConfig?.transformers || {},
  };

  if (hasIgnoreOverride) {
    const proposalIgnorePaths = Array.isArray(proposalIgnorePathsRaw)
      ? proposalIgnorePathsRaw
      : typeof proposalIgnorePathsRaw === "string"
        ? [proposalIgnorePathsRaw]
        : [];

    mergedConfig.ignorePaths = proposalIgnorePaths;

    logger.debug("Using per-proposal ignorePaths override", {
      operation: "getMergedConfig.ignorePaths",
      baseIgnorePaths: baseConfig?.ignorePaths || [],
      proposalIgnorePaths,
      rawValue: proposalIgnorePathsRaw,
      changeType: proposal.changeType,
    });
  }

  if (hasTransformerOverride) {
    mergedConfig.transformers = proposalTransformers;

    logger.debug("Using per-proposal transformers override", {
      operation: "getMergedConfig.transformers",
      baseTransformers: baseConfig?.transformers
        ? Object.keys(baseConfig.transformers)
        : [],
      proposalTransformers: Object.keys(proposalTransformers),
      changeType: proposal.changeType,
    });
  }

  return mergedConfig;
}

/**
 * Creates a clean copy of proposal without metadata fields
 */
function stripMetadata(
  proposal: ProposalWithMetadata | NormalizedProposal,
): NormalizedProposal {
  const { ignorePaths, transformers, ...cleanProposal } =
    proposal as ProposalWithMetadata;
  return cleanProposal as NormalizedProposal;
}

/**
 * Checks if an actual proposal matches an expected proposal.
 * Uses strict matching - all fields in actual must exist in expected.
 *
 * @param expected - The expected proposal (may contain ignorePaths metadata)
 * @param actual - The actual proposal
 * @param config - Validation configuration for ignoring paths and transformers
 * @returns True if proposals match according to strict rules
 */
function proposalMatches(
  expected: ProposalWithMetadata | NormalizedProposal,
  actual: NormalizedProposal,
  config?: ValidationConfig,
): boolean {
  // Extract per-proposal config if present
  const mergedConfig = getMergedConfig(expected, config);

  // Strip metadata from expected for comparison
  const cleanExpected = stripMetadata(expected);
  for (const key of Object.keys(actual) as Array<keyof NormalizedProposal>) {
    if (!(key in cleanExpected)) {
      if (!mergedConfig || !shouldIgnorePath(key, mergedConfig)) {
        logger.debug("Proposal match failed: extra field in actual", {
          operation: "proposalMatches.extraField",
          field: key,
          actualValue: actual[key],
        });
        return false;
      }
    }
  }

  for (const key of Object.keys(cleanExpected) as Array<
    keyof NormalizedProposal
  >) {
    if (mergedConfig && shouldIgnorePath(key, mergedConfig)) {
      continue;
    }

    let expectedValue = cleanExpected[key];
    let actualValue = actual[key];

    if (mergedConfig) {
      const expectedResult = applyTransformer(
        expectedValue,
        key,
        mergedConfig,
        true,
      );
      const actualResult = applyTransformer(
        actualValue,
        key,
        mergedConfig,
        false,
      );

      if (
        expectedResult.value !== expectedValue ||
        actualResult.value !== actualValue
      ) {
        logger.debug("Applied transformer to field", {
          operation: "proposalMatches.transform",
          field: key,
          expectedBefore: expectedValue,
          expectedAfter: expectedResult.value,
          actualBefore: actualValue,
          actualAfter: actualResult.value,
        });
      }

      expectedValue = expectedResult.value;
      actualValue = actualResult.value;
    }

    if (expectedValue === undefined) {
      continue;
    }

    if (actualValue === undefined) {
      logger.debug("Proposal match failed: missing field in actual", {
        operation: "proposalMatches.missingField",
        field: key,
        expectedValue,
      });
      return false;
    }

    if (typeof expectedValue === "object" && expectedValue !== null) {
      if (!actualValue || typeof actualValue !== "object") {
        return false;
      }
      if (!deepStrictMatch(expectedValue, actualValue, mergedConfig, key)) {
        logger.debug("Proposal match failed: nested object mismatch", {
          operation: "proposalMatches.nestedMismatch",
          field: key,
        });
        return false;
      }
    } else {
      if (!deepEquals(expectedValue, actualValue)) {
        logger.debug("Proposal match failed: primitive value mismatch", {
          operation: "proposalMatches.valueMismatch",
          field: key,
          expectedValue,
          actualValue,
        });
        return false;
      }
    }
  }

  return true;
}

/**
 * Deep strict matching for nested objects.
 * Validates that actual contains exactly the same fields as expected.
 *
 * @param expected - The expected object
 * @param actual - The actual object
 * @param config - Validation configuration
 * @param parentPath - Path to this object for path-based operations
 * @returns True if objects match strictly
 */
function deepStrictMatch(
  expected: any,
  actual: any,
  config?: ValidationConfig,
  parentPath?: string,
): boolean {
  if (expected === null || expected === undefined) {
    return expected === actual;
  }

  if (typeof expected !== "object") {
    return deepEquals(expected, actual);
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) {
      return false;
    }
    return expected.every((exp, i) => {
      const elementPath = parentPath ? `${parentPath}[${i}]` : `[${i}]`;
      if (config && shouldIgnorePath(elementPath, config)) {
        return true;
      }

      let expectedElem = exp;
      let actualElem = actual[i];
      if (config) {
        const expectedResult = applyTransformer(exp, elementPath, config, true);
        const actualResult = applyTransformer(
          actual[i],
          elementPath,
          config,
          false,
        );
        expectedElem = expectedResult.value;
        actualElem = actualResult.value;
      }

      return deepStrictMatch(expectedElem, actualElem, config, elementPath);
    });
  }

  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);

  for (const key of actualKeys) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    if (!expectedKeys.includes(key)) {
      if (!config || !shouldIgnorePath(path, config)) {
        return false;
      }
    }
  }

  for (const key of expectedKeys) {
    const path = parentPath ? `${parentPath}.${key}` : key;

    if (config && shouldIgnorePath(path, config)) {
      continue;
    }

    if (!(key in actual)) {
      return false;
    }

    let expectedVal = expected[key];
    let actualVal = actual[key];
    if (config) {
      const expectedResult = applyTransformer(expectedVal, path, config, true);
      const actualResult = applyTransformer(actualVal, path, config, false);
      expectedVal = expectedResult.value;
      actualVal = actualResult.value;
    }

    if (!deepStrictMatch(expectedVal, actualVal, config, path)) {
      return false;
    }
  }

  return true;
}

export function compareProposalSets(
  expected: (ProposalWithMetadata | NormalizedProposal)[],
  actual: NormalizedProposal[],
  logDetails = false,
  config?: ValidationConfig,
): ProposalComparisonResult {
  const unmatchedExpected: (ProposalWithMetadata | NormalizedProposal)[] = [
    ...expected,
  ];
  const unmatchedActual: NormalizedProposal[] = [...actual];
  const matchedPairs: Array<
    [ProposalWithMetadata | NormalizedProposal, NormalizedProposal]
  > = [];

  logger.debug("Starting proposal set comparison", {
    operation: "compareProposalSets.start",
    expectedCount: expected.length,
    actualCount: actual.length,
    validationMode: "strict",
    hasConfig: !!config,
    ignorePaths: config?.ignorePaths || [],
  });

  for (let i = unmatchedExpected.length - 1; i >= 0; i--) {
    const exp = unmatchedExpected[i];

    logger.debug("Attempting to match expected proposal", {
      operation: "compareProposalSets.matching",
      expectedIndex: i,
      changeType: exp.changeType,
      remainingActual: unmatchedActual.length,
    });

    const actualIndex = unmatchedActual.findIndex((act) =>
      proposalMatches(exp, act, config),
    );

    if (actualIndex !== -1) {
      logger.debug("Found matching proposal", {
        operation: "compareProposalSets.matched",
        expectedIndex: i,
        actualIndex,
        changeType: exp.changeType,
      });
      matchedPairs.push([exp, unmatchedActual[actualIndex]]);
      unmatchedExpected.splice(i, 1);
      unmatchedActual.splice(actualIndex, 1);
    } else {
      logger.debug("No match found for expected proposal", {
        operation: "compareProposalSets.noMatch",
        expectedIndex: i,
        changeType: exp.changeType,
        proposal: exp,
      });
    }
  }

  const matches =
    unmatchedExpected.length === 0 && unmatchedActual.length === 0;

  if (logDetails) {
    logger.info("Proposal set comparison (strict matching)", {
      operation: "compareProposalSets",
      expectedCount: expected.length,
      actualCount: actual.length,
      matchedCount: matchedPairs.length,
      unmatchedExpectedCount: unmatchedExpected.length,
      unmatchedActualCount: unmatchedActual.length,
      matches,
    });

    if (unmatchedExpected.length > 0) {
      logger.debug("Unmatched expected proposals", {
        proposals: unmatchedExpected,
      });
    }

    if (unmatchedActual.length > 0) {
      logger.debug("Unmatched actual proposals", {
        proposals: unmatchedActual,
      });
    }
  }

  return {
    matches,
    missingInActual: unmatchedExpected.map(stripMetadata),
    unexpectedInActual: unmatchedActual,
    matchedCount: matchedPairs.length,
  };
}

/**
 * Logs detailed information about proposals for debugging
 *
 * @param proposals - Proposals to log
 * @param type - Type of proposals (e.g., "expected" or "actual")
 * @param referenceKey - Optional reference key for context
 */
export function logProposalDetails(
  proposals: Array<ProposalWithMetadata | NormalizedProposal>,
  type: "expected" | "actual",
  referenceKey?: string,
): void {
  logger.info(`Logging ${type} proposals`, {
    operation: `log.${type}`,
    count: proposals.length,
    referenceKey,
  });

  proposals.forEach((proposal, index) => {
    // Strip metadata for logging
    const cleanProposal = stripMetadata(proposal);
    const canonical = canonicalizeObject(cleanProposal);

    logger.debug(`${type} proposal [${index}]`, {
      operation: `log.${type}.detail`,
      index,
      proposal: cleanProposal,
      canonicalJson: JSON.stringify(canonical),
      hasIgnorePaths: "ignorePaths" in proposal,
    });
  });
}
