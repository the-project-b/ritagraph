import { createLogger } from "@the-project-b/logging";
import { NormalizedProposal } from "./proposal-comparison.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "SituationAwareExpectedValues",
});

/**
 * Performs situation-aware substitution on expected proposal values.
 *
 * Currently supported substitutions:
 * - mutationVariables.effectiveDate: If present, replace its value with
 *   today's date at UTC midnight (T00:00:00.000Z) at execution time.
 *
 * Notes:
 * - If a proposal does not include mutationVariables or does not specify
 *   effectiveDate, the proposal is returned unchanged.
 * - We intentionally do NOT add an effectiveDate when it is missing, since
 *   some datasets legitimately omit it.
 */
export function substituteSituationAwareExpectedValues(
  proposals: ReadonlyArray<NormalizedProposal>,
  now: Date = new Date(),
): NormalizedProposal[] {
  // Compute today's date at UTC midnight to match typical ISO date-only handling
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDay = now.getUTCDate();
  const todayAtUtcMidnight = new Date(
    Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0),
  ).toISOString();

  const transformed = proposals.map((proposal) => {
    const hasMutationVariables = !!proposal?.mutationVariables;
    const hasEffectiveDate =
      hasMutationVariables &&
      "effectiveDate" in
        (proposal.mutationVariables as { data: Record<string, unknown> }).data;
    if (hasEffectiveDate) {
      return proposal;
    }

    // startDate and effectiveDate are used for creation and change proposals respectively
    const dateKey =
      proposal.changeType === "change" ? "effectiveDate" : "startDate";

    const newMutationVariables = {
      ...(proposal.mutationVariables as Record<string, unknown>),
      data: {
        ...(proposal.mutationVariables as { data: Record<string, unknown> })
          .data,
        [dateKey]: todayAtUtcMidnight,
      },
    };

    const updated: NormalizedProposal = {
      ...proposal,
      mutationVariables: newMutationVariables,
    };
    return updated;
  });

  logger.info("Situation-aware substitution executed for expected proposals", {
    operation: "subSituationAwareExpectedValues",
    count: transformed.length,
  });

  return transformed;
}
