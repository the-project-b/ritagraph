import {
  NormalizedProposal,
  ProposalComparisonResult,
  hashProposal,
  canonicalizeObject,
} from "./proposal-comparison.js";
import { diffLines } from "diff";

/**
 * Formats data change proposals for display in evaluation results.
 * Handles both successful matches and mismatches with detailed formatting.
 */
export class ProposalFormatter {
  private readonly indent = "  ";

  /**
   * Format a single proposal as JSON-like string
   */
  private formatProposal(
    proposal: NormalizedProposal,
    statusIndicator?: string,
  ): string[] {
    if (proposal.changeType === "creation") {
      throw new Error("Creation proposals are not supported yet");
    }

    const lines: string[] = [
      "    {",
      `      changeType: "${proposal.changeType}",`,
      `      changedField: "${proposal.changedField}",`,
      `      newValue: "${proposal.newValue}",`,
    ];

    if (proposal.mutationQueryPropertyPath) {
      lines.push(
        `      mutationQueryPropertyPath: "${proposal.mutationQueryPropertyPath}",`,
      );
    }

    if (proposal.relatedUserId) {
      lines.push(`      relatedUserId: "${proposal.relatedUserId}",`);
    }

    if (proposal.mutationVariables) {
      lines.push(
        `      mutationVariables: ${JSON.stringify(proposal.mutationVariables)},`,
      );
    }

    // Add closing brace with optional status indicator
    const closingBrace = statusIndicator ? `    } ${statusIndicator}` : "    }";
    lines.push(closingBrace);

    return lines;
  }

  /**
   * Format an array of proposals
   */
  private formatProposalArray(
    proposals: NormalizedProposal[],
    statusMap?: Map<string, string>,
  ): string[] {
    const result: string[] = [];

    proposals.forEach((proposal, index) => {
      const isLast = index === proposals.length - 1;
      const status = statusMap?.get(hashProposal(proposal));
      const proposalLines = this.formatProposal(proposal, status);

      // Add comma to all but the last line of each proposal except the last proposal
      if (!isLast) {
        proposalLines[proposalLines.length - 1] += ",";
      }

      result.push(...proposalLines);
    });

    return result;
  }

  /**
   * Format successful match output
   */
  formatSuccess(_expectedProposals: NormalizedProposal[]): string {
    return "✅ Evaluation Passed: All data change proposals matched successfully!";
  }

  /**
   * Format failure output with detailed comparison
   */
  formatFailure(
    expectedProposals: NormalizedProposal[],
    actualProposals: NormalizedProposal[],
    _comparisonResult: ProposalComparisonResult,
  ): string {
    // Generate the diff directly
    const diff = printDiff(expectedProposals, actualProposals);

    // Build minimal output with just the failure message and diff
    const sections = [
      "❌ Evaluation Failed: Data Change Proposals Don't Match",
      "",
      "---",
      diff,
      "---",
    ];

    return sections.join("\n");
  }

  /**
   * Generate a list of specific issues found during comparison
   */
  private generateIssuesList(
    expectedProposals: NormalizedProposal[],
    actualProposals: NormalizedProposal[],
    comparisonResult: ProposalComparisonResult,
  ): string[] {
    const issues: string[] = [];
    let issueNum = 1;

    // Report missing proposals
    if (comparisonResult.missingInActual.length > 0) {
      const missingDescriptions = expectedProposals.filter((p) =>
        comparisonResult.missingInActual.includes(hashProposal(p)),
      );

      issues.push(
        `  ${issueNum}. Missing expected: ${missingDescriptions.join(", ")}`,
      );
      issueNum++;
    }

    // Report unexpected proposals
    if (comparisonResult.unexpectedInActual.length > 0) {
      const unexpectedDescriptions = actualProposals
        .filter((p) =>
          comparisonResult.unexpectedInActual.includes(hashProposal(p)),
        )
        .map(
          (p) => `mutationVariables "${JSON.stringify(p.mutationVariables)}"`,
        );

      issues.push(
        `  ${issueNum}. Unexpected proposals with: ${unexpectedDescriptions.join(", ")}`,
      );
      issueNum++;
    }

    const diff = printDiff(expectedProposals, actualProposals);
    issues.push("\n---\n");
    issues.push(diff);
    issues.push("\n---\n");

    return issues;
  }

  /**
   * Main formatting method that decides between success and failure formatting
   */
  format(
    expectedProposals: NormalizedProposal[],
    actualProposals: NormalizedProposal[],
    comparisonResult: ProposalComparisonResult,
  ): string {
    if (comparisonResult.matches) {
      return this.formatSuccess(expectedProposals);
    } else {
      return this.formatFailure(
        expectedProposals,
        actualProposals,
        comparisonResult,
      );
    }
  }
}

function printDiff(
  expectedProposals: NormalizedProposal[],
  actualProposals: NormalizedProposal[],
) {
  try {
    // Heuristically align proposals by similarity so order differences don't dominate the diff
    type Pair = { expectedIndex: number; actualIndex: number; score: number };

    // Key-specific weights; if a key is listed here, its match contributes this many points.
    // Keys not listed fall back to default weights below.
    const KEY_WEIGHTS: Readonly<Record<string, number>> = {
      changeType: 3,
      changedField: 5,
      mutationQueryPropertyPath: 3,
      relatedUserId: 2,
      newValue: 2,
      mutationVariables: 4,
    } as const;

    const DEFAULT_PRIMITIVE_POINTS = 1;
    const DEFAULT_OBJECT_POINTS = 2;

    const scorePair = (
      e: NormalizedProposal,
      a: NormalizedProposal,
    ): number => {
      let score = 0;
      // Compare only keys present in both objects. Use generic logic so we don't
      // need to know specific fields of NormalizedProposal.
      for (const key of Object.keys(e) as Array<keyof NormalizedProposal>) {
        const eValue = e[key] as unknown;
        if (eValue === undefined || eValue === null) continue;
        const aValue = a[key] as unknown;
        if (aValue === undefined || aValue === null) continue;

        // Deep compare for object-like values (including mutationVariables)
        if (typeof eValue === "object") {
          try {
            const eCanon = JSON.stringify(canonicalizeObject(eValue));
            const aCanon = JSON.stringify(canonicalizeObject(aValue));
            if (eCanon === aCanon)
              score += KEY_WEIGHTS[key as string] ?? DEFAULT_OBJECT_POINTS;
          } catch {
            // Fallback: shallow strict equality
            if (eValue === aValue)
              score += KEY_WEIGHTS[key as string] ?? DEFAULT_OBJECT_POINTS;
          }
        } else {
          // Primitive comparison via string normalization for robustness
          if (String(eValue) === String(aValue))
            score += KEY_WEIGHTS[key as string] ?? DEFAULT_PRIMITIVE_POINTS;
        }
      }
      return score;
    };

    const pairs: Pair[] = [];
    for (let i = 0; i < expectedProposals.length; i++) {
      for (let j = 0; j < actualProposals.length; j++) {
        pairs.push({
          expectedIndex: i,
          actualIndex: j,
          score: scorePair(expectedProposals[i], actualProposals[j]),
        });
      }
    }

    // Greedy maximum matching by descending score
    pairs.sort((a, b) => b.score - a.score);
    const usedExpected = new Set<number>();
    const usedActual = new Set<number>();
    const aligned: Array<{
      expectedIndex: number | null;
      actualIndex: number | null;
    }> = [];

    for (const p of pairs) {
      if (usedExpected.has(p.expectedIndex) || usedActual.has(p.actualIndex))
        continue;
      // Prefer only positive scores; if no positive matches exist, we will append leftover below
      if (p.score <= 0) continue;
      usedExpected.add(p.expectedIndex);
      usedActual.add(p.actualIndex);
      aligned.push({
        expectedIndex: p.expectedIndex,
        actualIndex: p.actualIndex,
      });
    }

    // Append remaining unmatched in stable order
    for (let i = 0; i < expectedProposals.length; i++) {
      if (!usedExpected.has(i))
        aligned.push({ expectedIndex: i, actualIndex: null });
    }
    for (let j = 0; j < actualProposals.length; j++) {
      if (!usedActual.has(j))
        aligned.push({ expectedIndex: null, actualIndex: j });
    }

    const toCanonicalPretty = (p: NormalizedProposal | null): string => {
      if (!p) return "<none>";
      const canon = canonicalizeObject(p);
      return JSON.stringify(canon, null, 2);
    };

    const headerLine = (title: string) =>
      `\n${title}\n${"-".repeat(title.length)}`;

    let output = "";
    aligned.forEach((entry, idx) => {
      const e =
        entry.expectedIndex !== null
          ? expectedProposals[entry.expectedIndex]
          : null;
      const a =
        entry.actualIndex !== null ? actualProposals[entry.actualIndex] : null;

      const eStr = toCanonicalPretty(e);
      const aStr = toCanonicalPretty(a);

      output += headerLine(`Proposal ${idx + 1} diff`);
      const diffs = diffLines(`${eStr}\n`, `${aStr}\n`);
      for (const part of diffs) {
        const prefix = part.added ? "+ " : part.removed ? "- " : "  ";
        const lines = part.value.split("\n");
        // Avoid trailing empty line duplication due to the added newline
        const toIterate =
          lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
        for (const line of toIterate) {
          output += `\n${prefix}${line}`;
        }
      }
      output += "\n";
    });

    console.warn(output);

    return output;
  } catch (err) {
    console.error("Failed to generate proposal diff:", err);
  }
}
