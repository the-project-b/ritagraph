import { createHash } from "crypto";
import {
  TypedEvaluator,
  EvaluatorParams,
  EvaluatorResult,
  EvaluationOptions,
  TextEvaluationInputs,
  TextEvaluationOutputs,
} from "../core/types.js";

// Define the specific types for this evaluator
interface DataChangeProposalInputs extends TextEvaluationInputs {
  readonly question: string;
}

interface DataChangeProposalOutputs extends TextEvaluationOutputs {
  readonly answer: string;
  readonly dataChangeProposals?: Array<{
    id: string;
    status: "pending" | "approved" | "rejected";
    description: string;
    changedField: string;
    newValue: string;
    mutationQuery?: {
      query: string;
      variables: Record<string, unknown>;
      propertyPath: string;
    };
    relatedUserId?: string;
    createdAt: string;
  }>;
}

interface DataChangeProposalReferenceOutputs {
  readonly expectedDataProposal?:
    | Array<{
        changedField: string;
        newValue: string;
        mutationQueryPropertyPath?: string;
        relatedUserId?: string;
      }>
    | {
        changedField: string;
        newValue: string;
        mutationQueryPropertyPath?: string;
        relatedUserId?: string;
      };
}

// Helper type for normalized proposals
interface NormalizedProposal {
  changedField: string;
  newValue: string;
  mutationQueryPropertyPath?: string;
  relatedUserId?: string;
}

/**
 * Creates an MD5 hash of a normalized proposal for comparison
 */
function hashProposal(proposal: NormalizedProposal): string {
  // Create a deterministic string representation
  const proposalString = JSON.stringify(
    {
      changedField: proposal.changedField || "",
      newValue: proposal.newValue || "",
      mutationQueryPropertyPath: proposal.mutationQueryPropertyPath || "",
      relatedUserId: proposal.relatedUserId || "",
    },
    Object.keys(proposal).sort(),
  ); // Sort keys for consistency

  return createHash("md5").update(proposalString).digest("hex");
}

/**
 * Creates a hash set from an array of proposals
 */
function createProposalHashSet(proposals: NormalizedProposal[]): Set<string> {
  return new Set(proposals.map(hashProposal));
}

/**
 * Compares two sets of proposals using hash comparison
 */
function compareProposalSets(
  expected: NormalizedProposal[],
  actual: NormalizedProposal[],
): {
  matches: boolean;
  expectedHashes: Set<string>;
  actualHashes: Set<string>;
  missingInActual: string[];
  unexpectedInActual: string[];
} {
  const expectedHashes = createProposalHashSet(expected);
  const actualHashes = createProposalHashSet(actual);

  const missingInActual = Array.from(expectedHashes).filter(
    (hash) => !actualHashes.has(hash),
  );
  const unexpectedInActual = Array.from(actualHashes).filter(
    (hash) => !expectedHashes.has(hash),
  );

  const matches =
    expectedHashes.size === actualHashes.size &&
    missingInActual.length === 0 &&
    unexpectedInActual.length === 0;

  return {
    matches,
    expectedHashes,
    actualHashes,
    missingInActual,
    unexpectedInActual,
  };
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
      "Verifies that the generated data change proposals match the expected proposal structure and values using deterministic hash comparison",
    defaultModel: "openai:gpt-4o", // Not used but kept for interface compatibility
    supportsCustomPrompt: false, // No LLM involved
    supportsReferenceKey: true,
  } as const,

  async evaluate(
    params: EvaluatorParams<
      DataChangeProposalInputs,
      DataChangeProposalOutputs,
      DataChangeProposalReferenceOutputs
    >,
    options: EvaluationOptions = {},
  ): Promise<EvaluatorResult> {
    const { referenceKey } = options;

    // Extract the expected data proposals from reference outputs
    let expectedProposals: NormalizedProposal[] = [];
    const key = referenceKey || "expectedDataProposal";
    
    // Check if reference outputs exist at all
    if (!params.referenceOutputs) {
      console.info(
        `[DATA_CHANGE_PROPOSAL] No reference outputs provided. Skipping data change proposal evaluation.`,
      );
      // Return a neutral result indicating this evaluation was not applicable
      return {
        key: "data_change_proposal_verification",
        score: 1, // Use 1 to not penalize when evaluation is not applicable
        comment: "Data change proposal evaluation not applicable - no reference outputs provided",
        metadata: {
          reason: "no_reference_outputs",
          evaluator_type: "DATA_CHANGE_PROPOSAL",
          skipped: true,
        },
      };
    }
    
    const referenceValue = params.referenceOutputs[key];
    
    // Check if the expected key exists in reference outputs
    if (referenceValue === undefined) {
      console.info(
        `[DATA_CHANGE_PROPOSAL] Reference key '${key}' not found. This example does not require data change proposal verification.`,
      );
      // Return a neutral result indicating this evaluation was not applicable for this example
      return {
        key: "data_change_proposal_verification",
        score: 1, // Use 1 to not penalize when evaluation is not applicable
        comment: `Data change proposal evaluation not applicable - no '${key}' in reference outputs`,
        metadata: {
          reason: "reference_key_not_found",
          expected_key: key,
          available_keys: Object.keys(params.referenceOutputs),
          evaluator_type: "DATA_CHANGE_PROPOSAL",
          skipped: true,
        },
      };
    }
    
    // Normalize expected proposals to always be an array
    expectedProposals = Array.isArray(referenceValue)
      ? referenceValue
      : [referenceValue];

    // Extract actual data change proposals from outputs
    const actualProposals = params.outputs.dataChangeProposals || [];

    // Extract only the static fields for comparison
    const normalizedActualProposals: NormalizedProposal[] = actualProposals.map(
      (proposal) => ({
        changedField: proposal.changedField,
        newValue: proposal.newValue,
        mutationQueryPropertyPath: proposal.mutationQuery?.propertyPath,
        relatedUserId: proposal.relatedUserId,
      }),
    );

    // Compare the proposal sets using hash comparison
    const comparisonResult = compareProposalSets(
      expectedProposals,
      normalizedActualProposals,
    );

    // Generate detailed comment about the comparison
    let comment = "";
    if (comparisonResult.matches) {
      comment = `Perfect match: All ${expectedProposals.length} expected data change proposals were found with exact matching static fields.`;
    } else {
      const issues: string[] = [];

      if (expectedProposals.length !== normalizedActualProposals.length) {
        issues.push(
          `Count mismatch: expected ${expectedProposals.length} proposals, got ${normalizedActualProposals.length}`,
        );
      }

      if (comparisonResult.missingInActual.length > 0) {
        issues.push(
          `Missing ${comparisonResult.missingInActual.length} expected proposal(s)`,
        );
        // Include details about what's missing
        const missingDetails = expectedProposals
          .filter((p) =>
            comparisonResult.missingInActual.includes(hashProposal(p)),
          )
          .map((p) => `{field: "${p.changedField}", value: "${p.newValue}"}`)
          .join(", ");
        issues.push(`Missing proposals: ${missingDetails}`);
      }

      if (comparisonResult.unexpectedInActual.length > 0) {
        issues.push(
          `Found ${comparisonResult.unexpectedInActual.length} unexpected proposal(s)`,
        );
        // Include details about what's unexpected
        const unexpectedDetails = normalizedActualProposals
          .filter((p) =>
            comparisonResult.unexpectedInActual.includes(hashProposal(p)),
          )
          .map((p) => `{field: "${p.changedField}", value: "${p.newValue}"}`)
          .join(", ");
        issues.push(`Unexpected proposals: ${unexpectedDetails}`);
      }

      comment = `Mismatch detected: ${issues.join(". ")}`;
    }

    // Return binary score: 1 for match, 0 for mismatch
    return {
      key: "data_change_proposal_verification",
      score: comparisonResult.matches ? 1 : 0,
      comment,
      metadata: {
        expectedProposalCount: expectedProposals.length,
        actualProposalCount: normalizedActualProposals.length,
        expectedHashes: Array.from(comparisonResult.expectedHashes),
        actualHashes: Array.from(comparisonResult.actualHashes),
        missingProposals: comparisonResult.missingInActual.length,
        unexpectedProposals: comparisonResult.unexpectedInActual.length,
        referenceKey,
        comparisonMethod: "md5_hash",
      },
    };
  },
} as const;
