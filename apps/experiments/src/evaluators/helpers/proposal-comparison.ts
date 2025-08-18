import { createLogger } from "@the-project-b/logging";
import { canonicalizeObject, hashCanonicalObject } from "./canonical-json.js";
import { DataChangeProposal } from "../implementations/types.js";

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
 * Creates an MD5 hash of a normalized proposal for comparison.
 * Uses canonical JSON serialization to handle deep nested objects.
 *
 * @param proposal - The proposal to hash
 * @param logDetails - Whether to log hashing details for debugging
 * @returns MD5 hash of the proposal
 */
export function hashProposal(
  proposal: NormalizedProposal,
  logDetails = false,
): string {
  // Canonicalize the entire proposal object (handles nested objects)
  const canonical = canonicalizeObject(proposal);
  const proposalString = JSON.stringify(canonical);

  if (logDetails) {
    logger.debug("Hashing proposal", {
      operation: "hashProposal",
      field:
        proposal.changeType === "change" ? proposal.changedField : undefined,
      canonicalString: proposalString,
      stringLength: proposalString.length,
    });
  }

  return hashCanonicalObject(proposal);
}

/**
 * Creates a hash set from an array of proposals
 *
 * @param proposals - Array of proposals to hash
 * @param logDetails - Whether to log hashing details
 * @returns Set of proposal hashes
 */
export function createProposalHashSet(
  proposals: NormalizedProposal[],
  logDetails = false,
): Set<string> {
  return new Set(proposals.map((p) => hashProposal(p, logDetails)));
}

/**
 * Result of comparing two sets of proposals
 */
export interface ProposalComparisonResult {
  matches: boolean;
  expectedHashes: Set<string>;
  actualHashes: Set<string>;
  missingInActual: string[];
  unexpectedInActual: string[];
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
 * Only compares fields that exist in the expected proposal (subset matching).
 *
 * @param expected - The expected proposal (may have fewer fields)
 * @param actual - The actual proposal (may have more fields)
 * @returns True if actual matches all fields present in expected
 */
function proposalMatches(
  expected: NormalizedProposal,
  actual: NormalizedProposal,
): boolean {
  // Only check fields that are actually present in expected
  // This is true subset matching - if expected doesn't specify a field, we don't check it
  for (const key of Object.keys(expected) as Array<keyof NormalizedProposal>) {
    const expectedValue = expected[key];
    const actualValue = actual[key];

    // Skip undefined or missing fields in expected
    if (expectedValue === undefined || expectedValue === null) {
      continue;
    }

    // For objects like mutationVariables, do deep comparison
    if (typeof expectedValue === "object") {
      // If actual doesn't have this object field, it's a mismatch
      if (!actualValue || typeof actualValue !== "object") {
        return false;
      }
      const expectedCanonical = canonicalizeObject(expectedValue);
      const actualCanonical = canonicalizeObject(actualValue);
      if (
        JSON.stringify(expectedCanonical) !== JSON.stringify(actualCanonical)
      ) {
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

export function compareProposalSets(
  expected: NormalizedProposal[],
  actual: NormalizedProposal[],
  logDetails = false,
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
      proposalMatches(exp, act),
    );

    if (actualIndex !== -1) {
      // Found a match
      matchedPairs.push([exp, unmatchedActual[actualIndex]]);
      unmatchedExpected.splice(i, 1);
      unmatchedActual.splice(actualIndex, 1);
    }
  }

  // Create hashes for unmatched proposals (for reporting)
  const missingHashes = unmatchedExpected.map((p) =>
    hashProposal(p, logDetails),
  );
  const unexpectedHashes = unmatchedActual.map((p) =>
    hashProposal(p, logDetails),
  );

  const matches =
    unmatchedExpected.length === 0 && unmatchedActual.length === 0;

  if (logDetails) {
    logger.info("Proposal set comparison (subset matching)", {
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

  // For compatibility, still return hash sets (though they're not used for matching now)
  const expectedHashes = new Set(
    expected.map((p) => hashProposal(p, logDetails)),
  );
  const actualHashes = new Set(actual.map((p) => hashProposal(p, logDetails)));

  return {
    matches,
    expectedHashes,
    actualHashes,
    missingInActual: missingHashes,
    unexpectedInActual: unexpectedHashes,
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
      hash: hashProposal(proposal),
    });
  });
}
