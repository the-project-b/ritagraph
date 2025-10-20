import { DataChangeProposal } from "../../../shared-types/base-annotation";

export function getLiveViewOfProposedChanges(
  dataChangeProposals: Array<DataChangeProposal>,
) {
  if (dataChangeProposals.length === 0) {
    return "";
  }

  const minutesAgo = (proposal: DataChangeProposal) => {
    const now = new Date();
    const proposalDate = new Date(proposal.createdAt);
    return Math.floor((now.getTime() - proposalDate.getTime()) / 1000 / 60);
  };
  const statusToText = (status: "approved" | "pending" | "rejected") => {
    switch (status) {
      case "approved":
        return "approved";
      case "pending":
        return "Proposed";
      case "rejected":
        return "Rejected";
    }
  };

  const effectiveFrom = (proposal: DataChangeProposal) => {
    if (proposal.changeType.startsWith("employee")) {
      return "";
    }

    if (
      proposal.changeType === "change" &&
      proposal.mutationQuery.variables.effectiveFrom
    ) {
      return `Effective from: ${new Date(
        proposal.mutationQuery.variables.effectiveFrom,
      ).toLocaleDateString()}`;
    }

    if (proposal.mutationQuery.variables.startDate) {
      return `Effective from: ${new Date(
        proposal.mutationQuery.variables.startDate,
      ).toLocaleDateString()}`;
    }

    return "";
  };

  const proposals: Array<string> = dataChangeProposals.map(
    (proposal) =>
      `- [${statusToText(proposal.status)}] ${proposal.description} | ${effectiveFrom(proposal)} (${minutesAgo(proposal)} minutes ago) -> DO NOT RE-PROPOSE THIS CHANGE`,
  );

  return `Since those proposals already exist \n${proposals.join("\n")}. I should not re-suggestion them.`;
}
