import { randomUUID as uuid } from "crypto";
import { DataChangeProposal } from "../../../graphs/shared-types/base-annotation";

export interface BaseProposalConfig {
  id?: string;
  changeType: "change" | "creation";
  relatedUserId: string;
  relatedContractId?: string;
  description: string;
  quote: string;
  runId: string;
  iteration?: number;
}

export function buildBaseProposal(
  config: BaseProposalConfig,
): Omit<
  DataChangeProposal,
  | "mutationQuery"
  | "statusQuoQuery"
  | "changedField"
  | "newValue"
  | "dynamicMutationVariables"
  | "properties"
> {
  return {
    id: config.id || uuid(),
    changeType: config.changeType,
    relatedUserId: config.relatedUserId,
    relatedContractId: config.relatedContractId,
    description: config.description,
    status: "pending",
    createdAt: new Date().toISOString(),
    quote: config.quote,
    runId: config.runId,
    iteration: config.iteration || 1,
  };
}

export function parseEffectiveDate(effectiveDate: string | undefined) {
  if (!effectiveDate) {
    const now = new Date();
    const utcDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    return {
      effectiveDate: utcDate.toISOString(),
    };
  }
  return { effectiveDate: new Date(effectiveDate).toISOString() };
}

export function parseStartDate(startDate: string | undefined) {
  if (!startDate) {
    const now = new Date();
    const utcDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    return {
      startDate: utcDate.toISOString(),
    };
  }
  return { startDate: new Date(startDate).toISOString() };
}
