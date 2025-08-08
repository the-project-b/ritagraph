import {
  NormalizedProposal,
  ProposalComparisonResult,
  hashProposal,
} from "./proposal-comparison.js";

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
    const lines: string[] = [
      "    {",
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
  formatSuccess(expectedProposals: NormalizedProposal[]): string {
    return [
      "✅ Evaluation Passed: Data Change Proposals Match",
      "",
      "EXPECTED & ACTUAL (matched):",
      "{",
      "  dataChangeProposals: [",
      ...this.formatProposalArray(expectedProposals),
      "  ]",
      "}",
      "",
      "✅ All proposals matched successfully!",
    ].join("\n");
  }

  /**
   * Format failure output with detailed comparison
   */
  formatFailure(
    expectedProposals: NormalizedProposal[],
    actualProposals: NormalizedProposal[],
    comparisonResult: ProposalComparisonResult,
  ): string {
    // Create status maps for both expected and actual
    const expectedStatusMap = new Map<string, string>();
    const actualStatusMap = new Map<string, string>();

    // Mark missing proposals in expected
    expectedProposals.forEach((p) => {
      const hash = hashProposal(p);
      if (comparisonResult.missingInActual.includes(hash)) {
        expectedStatusMap.set(hash, "❌ MISSING");
      } else {
        expectedStatusMap.set(hash, "✅");
      }
    });

    // Mark unexpected and partial matches in actual
    actualProposals.forEach((p) => {
      const hash = hashProposal(p);

      // Check if this is a partial match (same field but different value)
      const expectedWithSameField = expectedProposals.find(
        (exp) =>
          exp.changedField === p.changedField &&
          exp.mutationQueryPropertyPath === p.mutationQueryPropertyPath &&
          exp.relatedUserId === p.relatedUserId,
      );

      const isPartialMatch =
        expectedWithSameField && expectedWithSameField.newValue !== p.newValue;
      const isUnexpected = comparisonResult.unexpectedInActual.includes(hash);

      if (isUnexpected && !isPartialMatch) {
        actualStatusMap.set(hash, "⚠️ UNEXPECTED");
      } else if (isPartialMatch) {
        actualStatusMap.set(
          hash,
          `⚠️ WRONG VALUE (expected "${expectedWithSameField.newValue}")`,
        );
      } else {
        actualStatusMap.set(hash, "✅");
      }
    });

    // Build sections
    const sections = [
      "❌ Evaluation Failed: Data Change Proposals Don't Match",
      "",
      "EXPECTED:",
      "{",
      "  dataChangeProposals: [",
      ...this.formatProposalArray(expectedProposals, expectedStatusMap),
      "  ]",
      "}",
      "",
      "ACTUAL:",
      "{",
      "  dataChangeProposals: [",
      ...this.formatProposalArray(actualProposals, actualStatusMap),
      "  ]",
      "}",
    ];

    // Add issues section if there are specific issues to report
    const issues = this.generateIssuesList(
      expectedProposals,
      actualProposals,
      comparisonResult,
    );
    if (issues.length > 0) {
      sections.push("", "ISSUES:", ...issues);
    }

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
      const missingDescriptions = expectedProposals
        .filter((p) =>
          comparisonResult.missingInActual.includes(hashProposal(p)),
        )
        .map(
          (p) => `changedField "${p.changedField}" with value "${p.newValue}"`,
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
        .map((p) => `changedField "${p.changedField}"`);

      issues.push(
        `  ${issueNum}. Unexpected proposals with: ${unexpectedDescriptions.join(", ")}`,
      );
      issueNum++;
    }

    // Report value mismatches
    for (const actual of actualProposals) {
      const expected = expectedProposals.find(
        (e) =>
          e.changedField === actual.changedField &&
          e.mutationQueryPropertyPath === actual.mutationQueryPropertyPath &&
          e.relatedUserId === actual.relatedUserId,
      );

      if (expected && expected.newValue !== actual.newValue) {
        issues.push(
          `  ${issueNum}. changedField "${actual.changedField}" value mismatch: "${actual.newValue}" instead of "${expected.newValue}"`,
        );
        issueNum++;
      }
    }

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
