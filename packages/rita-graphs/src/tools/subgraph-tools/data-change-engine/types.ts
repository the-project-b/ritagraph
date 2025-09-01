import { DataChangeProposal } from "../../../graphs/shared-types/base-annotation.js";
import { PaymentFrequency } from "../../../generated/graphql.js";

export interface BaseCorrectionParams {
  existingProposalId?: string;
  quote: string;
}

export interface ChangePaymentDetailsParams extends BaseCorrectionParams {
  employeeId: string;
  paymentId: string;
  contractId: string;
  newAmount?: number;
  newFrequency?: PaymentFrequency;
  newMonthlyHours?: number;
  effectiveDate?: string;
}

export interface CreatePaymentParams extends BaseCorrectionParams {
  employeeId: string;
  contractId: string;
  title: string;
  paymentType: string;
  amount?: number;
  monthlyHours?: number;
  frequency?: PaymentFrequency;
  startDate?: string;
}

export interface CorrectionResult {
  success: true;
  isCorrection: true;
  correctedProposal: DataChangeProposal;
  message: string;
}

export interface StandardResult {
  instructions: string;
  dataChangeProposals: Array<{
    id: string;
    description: string;
  }>;
}

export interface ErrorResult {
  error: string;
}

export type ToolResult<T extends BaseCorrectionParams> =
  T["existingProposalId"] extends string
    ? CorrectionResult | ErrorResult
    : StandardResult | ErrorResult;
