/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "crypto";
import { createLogger } from "@the-project-b/logging";
import {
  EvaluationOptions,
  EvaluatorParams,
  EvaluationResult,
  TextEvaluationInputs,
  TextEvaluationOutputs,
  TypedEvaluator,
} from "../core/types.js";

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
        mutationVariables?: any;
      }>
    | {
        changedField: string;
        newValue: string;
        mutationQueryPropertyPath?: string;
        relatedUserId?: string;
        mutationVariables?: any;
      };
}

// Helper type for normalized proposals
interface NormalizedProposal {
  changedField: string;
  newValue: string;
  mutationQueryPropertyPath?: string;
  relatedUserId?: string;
  mutationVariables?: any;
}

/**
 * Creates an MD5 hash of a normalized proposal for comparison
 */
function hashProposal(proposal: NormalizedProposal): string {
  // Create a deterministic string representation with sorted keys
  const sortedProposal = {
    changedField: proposal.changedField || "",
    mutationQueryPropertyPath: proposal.mutationQueryPropertyPath || "",
    mutationVariables: proposal.mutationVariables || null,
    newValue: proposal.newValue || "",
    relatedUserId: proposal.relatedUserId || "",
  };

  // JSON.stringify with sorted keys
  const proposalString = JSON.stringify(
    sortedProposal,
    Object.keys(sortedProposal).sort(),
  );
  const hash = createHash("md5").update(proposalString).digest("hex");
  return hash;
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

    // Extract actual data change proposals from outputs
    const actualProposals = params.outputs.dataChangeProposals || [];

    // Extract only the static fields for comparison
    const normalizedActualProposals: NormalizedProposal[] = actualProposals.map(
      (proposal: any) => {
        const normalized = {
          changedField: proposal.changedField,
          newValue: proposal.newValue,
          mutationQueryPropertyPath:
            proposal.mutationQueryPropertyPath ||
            proposal.mutationQuery?.propertyPath,
          relatedUserId: proposal.relatedUserId,
          mutationVariables: proposal.mutationQuery?.variables,
        };
        return normalized;
      },
    );

    // Compare the proposal sets using hash comparison
    const comparisonResult = compareProposalSets(
      expectedProposals,
      normalizedActualProposals,
    );

    // Generate structured JSON-like comment about the comparison
    let comment = "";

    if (comparisonResult.matches) {
      comment = [
        "✅ Evaluation Passed: Data Change Proposals Match",
        "",
        "EXPECTED:",
        "{",
        "  proposals: [",
        ...expectedProposals.map((p, i) => {
          const lines = [
            "    {",
            `      field: "${p.changedField}",`,
            `      value: "${p.newValue}",`,
          ];
          if (p.mutationQueryPropertyPath) {
            lines.push(`      path: "${p.mutationQueryPropertyPath}",`);
          }
          if (p.relatedUserId) {
            lines.push(
              `      user: "${p.relatedUserId.slice(0, 8)}...${p.relatedUserId.slice(-8)}",`,
            );
          }
          lines.push(`      status: "✅ MATCHED"`);
          lines.push(`    }${i < expectedProposals.length - 1 ? "," : ""}`);
          return lines.join("\n");
        }),
        "  ]",
        "}",
        "",
        "All proposals matched successfully!",
      ].join("\n");
    } else {
      // Build EXPECTED section with status for each
      const expectedSection = [
        "EXPECTED:",
        "{",
        "  proposals: [",
        ...expectedProposals.map((p, i) => {
          const isMissing = comparisonResult.missingInActual.includes(
            hashProposal(p),
          );
          const lines = [
            "    {",
            `      field: "${p.changedField}",`,
            `      value: "${p.newValue}",`,
          ];
          if (p.mutationQueryPropertyPath) {
            lines.push(`      path: "${p.mutationQueryPropertyPath}",`);
          }
          if (p.relatedUserId) {
            lines.push(
              `      user: "${p.relatedUserId.slice(0, 8)}...${p.relatedUserId.slice(-8)}",`,
            );
          }
          lines.push(
            `      status: "${isMissing ? "❌ MISSING" : "✅ FOUND"}"`,
          );
          lines.push(`    }${i < expectedProposals.length - 1 ? "," : ""}`);
          return lines.join("\n");
        }),
        "  ]",
        "}",
      ];

      // Build ACTUAL section with status for each
      const actualSection = [
        "ACTUAL:",
        "{",
        "  proposals: [",
        ...normalizedActualProposals.map((p, i) => {
          const isUnexpected = comparisonResult.unexpectedInActual.includes(
            hashProposal(p),
          );

          // Check if this is a partial match (same field but different value)
          const expectedWithSameField = expectedProposals.find(
            (exp) =>
              exp.changedField === p.changedField &&
              exp.mutationQueryPropertyPath === p.mutationQueryPropertyPath,
          );
          const isPartialMatch =
            expectedWithSameField &&
            expectedWithSameField.newValue !== p.newValue;

          const lines = [
            "    {",
            `      field: "${p.changedField}",`,
            `      value: "${p.newValue}",`,
          ];
          if (p.mutationQueryPropertyPath) {
            lines.push(`      path: "${p.mutationQueryPropertyPath}",`);
          }
          if (p.relatedUserId) {
            lines.push(
              `      user: "${p.relatedUserId.slice(0, 8)}...${p.relatedUserId.slice(-8)}",`,
            );
          }
          if (p.mutationVariables?.data?.id) {
            lines.push(`      paymentId: "${p.mutationVariables.data.id}",`);
          }

          let status = "✅ MATCHED";
          if (isUnexpected && !isPartialMatch) {
            status = "⚠️ UNEXPECTED";
          } else if (isPartialMatch) {
            status = `⚠️ PARTIAL MATCH (wrong value - expected "${expectedWithSameField.newValue}")`;
          }

          lines.push(`      status: "${status}"`);
          lines.push(
            `    }${i < normalizedActualProposals.length - 1 ? "," : ""}`,
          );
          return lines.join("\n");
        }),
        "  ]",
        "}",
      ];

      // Build ISSUES section
      const issuesList: string[] = [];
      let issueNum = 1;

      if (comparisonResult.missingInActual.length > 0) {
        const missingFields = expectedProposals
          .filter((p) =>
            comparisonResult.missingInActual.includes(hashProposal(p)),
          )
          .map((p) => `${p.changedField} with value "${p.newValue}"`);
        issuesList.push(
          `  ${issueNum}. Missing expected ${missingFields.join(", ")}`,
        );
        issueNum++;
      }

      if (comparisonResult.unexpectedInActual.length > 0) {
        const unexpectedFields = normalizedActualProposals
          .filter((p) =>
            comparisonResult.unexpectedInActual.includes(hashProposal(p)),
          )
          .map((p) => `"${p.changedField}" field`);
        issuesList.push(
          `  ${issueNum}. Unexpected ${unexpectedFields.join(", ")}`,
        );
        issueNum++;
      }

      // Check for value mismatches
      for (const actual of normalizedActualProposals) {
        const expected = expectedProposals.find(
          (e) =>
            e.changedField === actual.changedField &&
            e.mutationQueryPropertyPath === actual.mutationQueryPropertyPath,
        );
        if (expected && expected.newValue !== actual.newValue) {
          issuesList.push(
            `  ${issueNum}. ${actual.changedField} value mismatch: "${actual.newValue}" instead of "${expected.newValue}"`,
          );
          issueNum++;
        }
      }

      const issuesSection =
        issuesList.length > 0 ? ["", "ISSUES:", ...issuesList] : [];

      comment = [
        "❌ Evaluation Failed: Data Change Proposals Don't Match",
        "",
        ...expectedSection,
        "",
        ...actualSection,
        ...issuesSection,
      ].join("\n");
    }

    const detailedComment = comment;

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
