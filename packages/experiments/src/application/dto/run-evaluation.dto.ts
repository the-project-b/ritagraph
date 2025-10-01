import { EvaluatorDefinition } from "../../domain/index.js";

export interface RunEvaluationDto {
  graphName: string;
  datasetName: string;
  splits?: string[];
  selectedCompanyId: string;
  preferredLanguage?: string;
  evaluators: EvaluatorDefinition[];
  experimentPrefix?: string;
  maxConcurrency?: number;
  numRepetitions?: number;
}

export interface RunEvaluationResult {
  jobId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  experimentName: string;
  experimentId?: string;
  message: string;
  url?: string;
  createdAt: Date;
}
