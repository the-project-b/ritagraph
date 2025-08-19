import { createLogger } from "@the-project-b/logging";
import { canonicalizeObject } from "./canonical-json.js";
import { DataChangeProposal } from "../implementations/types.js";
import { 
  ValidationConfig, 
  shouldIgnorePath, 
  applyTransformer 
} from "./validation-config.js";

// Re-export canonicalizeObject for use in other modules
export { canonicalizeObject } from "./canonical-json.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "ProposalComparison",
});

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
 * Normalizes a proposal to ensure consistent types and values.
 * Converts newValue to string and handles missing fields.
 *
 * @param proposal - The proposal to normalize
 * @returns A normalized proposal with consistent types
 */
export function normalizeProposal(
  proposal: DataChangeProposal,
): NormalizedProposal {
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
    mutationVariables: proposal.mutationQuery?.variables, // Already at top level from extraction
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
 * Compares two sets of proposals using hash comparison.
 * Order-independent comparison using canonical JSON hashing.
 *
 * @param expected - Expected proposals
 * @param actual - Actual proposals
 * @param logDetails - Whether to log comparison details
 * @returns Comparison result with match status and differences
 */
/**
 * Checks if an actual proposal matches an expected proposal.
 * Uses strict matching - all fields in actual must exist in expected.
 *
 * @param expected - The expected proposal
 * @param actual - The actual proposal
 * @param config - Validation configuration for ignoring paths and transformers
 * @returns True if proposals match according to strict rules
 */
function proposalMatches(
  expected: NormalizedProposal,
  actual: NormalizedProposal,
  config?: ValidationConfig,
): boolean {
  // Strict matching: check that actual doesn't have extra fields
  for (const key of Object.keys(actual) as Array<keyof NormalizedProposal>) {
    if (!(key in expected)) {
      // Check if this path should be ignored
      if (!config || !shouldIgnorePath(key, config)) {
        return false; // Extra field in actual that's not ignored
      }
    }
  }

  // Check all fields in expected match actual
  for (const key of Object.keys(expected) as Array<keyof NormalizedProposal>) {
    // Skip ignored paths
    if (config && shouldIgnorePath(key, config)) {
      continue;
    }

    let expectedValue = expected[key];
    let actualValue = actual[key];

    // Apply transformers if configured
    if (config) {
      expectedValue = applyTransformer(expectedValue, key, config, true);
      actualValue = applyTransformer(actualValue, key, config, false);
    }

    // Skip undefined fields in expected (treat as optional)
    if (expectedValue === undefined) {
      continue;
    }

    // Check if actual is missing this field
    if (actualValue === undefined) {
      return false;
    }

    // For objects like mutationVariables, do deep strict comparison
    if (typeof expectedValue === "object" && expectedValue !== null) {
      if (!actualValue || typeof actualValue !== "object") {
        return false;
      }
      // Use deep strict matching for nested objects
      if (!deepStrictMatch(expectedValue, actualValue, config, key)) {
        return false;
      }
    } else {
      // For primitive values, ensure both are strings for comparison
      const expStr = String(expectedValue);
      const actStr = String(actualValue || "");
      if (expStr !== actStr) {
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
  parentPath?: string
): boolean {
  // Handle null/undefined
  if (expected === null || expected === undefined) {
    return expected === actual;
  }
  
  // If not an object, do simple comparison
  if (typeof expected !== "object") {
    return String(expected) === String(actual);
  }
  
  // For arrays, compare length and elements
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) {
      return false;
    }
    return expected.every((exp, i) => {
      const elementPath = parentPath ? `${parentPath}[${i}]` : `[${i}]`;
      if (config && shouldIgnorePath(elementPath, config)) {
        return true;
      }
      
      // Apply transformers to array elements
      let expectedElem = exp;
      let actualElem = actual[i];
      if (config) {
        expectedElem = applyTransformer(exp, elementPath, config, true);
        actualElem = applyTransformer(actual[i], elementPath, config, false);
      }
      
      return deepStrictMatch(expectedElem, actualElem, config, elementPath);
    });
  }
  
  // For objects, strict field checking
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  
  // Check for extra fields in actual (strict mode)
  for (const key of actualKeys) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    if (!expectedKeys.includes(key)) {
      if (!config || !shouldIgnorePath(path, config)) {
        return false; // Extra field not in expected and not ignored
      }
    }
  }
  
  // Check all expected fields
  for (const key of expectedKeys) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    
    // Skip ignored paths
    if (config && shouldIgnorePath(path, config)) {
      continue;
    }
    
    if (!(key in actual)) {
      return false; // Missing expected field
    }
    
    // Apply transformers
    let expectedVal = expected[key];
    let actualVal = actual[key];
    if (config) {
      expectedVal = applyTransformer(expectedVal, path, config, true);
      actualVal = applyTransformer(actualVal, path, config, false);
    }
    
    // Recursively check nested values
    if (!deepStrictMatch(expectedVal, actualVal, config, path)) {
      return false;
    }
  }
  
  return true;
}

export function compareProposalSets(
  expected: NormalizedProposal[],
  actual: NormalizedProposal[],
  logDetails = false,
  config?: ValidationConfig,
): ProposalComparisonResult {
  // For subset matching, we need to find matches differently
  const unmatchedExpected: NormalizedProposal[] = [...expected];
  const unmatchedActual: NormalizedProposal[] = [...actual];
  const matchedPairs: Array<[NormalizedProposal, NormalizedProposal]> = [];

  // Try to match each expected with an actual
  for (let i = unmatchedExpected.length - 1; i >= 0; i--) {
    const exp = unmatchedExpected[i];

    // Find a matching actual proposal
    const actualIndex = unmatchedActual.findIndex((act) =>
      proposalMatches(exp, act, config),
    );

    if (actualIndex !== -1) {
      // Found a match
      matchedPairs.push([exp, unmatchedActual[actualIndex]]);
      unmatchedExpected.splice(i, 1);
      unmatchedActual.splice(actualIndex, 1);
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
    missingInActual: unmatchedExpected,
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
  proposals: Array<NormalizedProposal>,
  type: "expected" | "actual",
  referenceKey?: string,
): void {
  logger.info(`Logging ${type} proposals`, {
    operation: `log.${type}`,
    count: proposals.length,
    referenceKey,
  });

  proposals.forEach((proposal, index) => {
    const canonical = canonicalizeObject(proposal);

    logger.debug(`${type} proposal [${index}]`, {
      operation: `log.${type}.detail`,
      index,
      proposal,
      canonicalJson: JSON.stringify(canonical),
    });
  });
}
