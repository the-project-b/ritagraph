// Graph names supported by this evaluator service
export type GraphName = "rita";

// Re-export context types
export type { GraphQLContext } from "./context.js";

// Import evaluator types
import type { ModelIdentifier } from "../evaluators/core/types";

export interface EvaluatorInput {
  type: string;
  customPrompt?: string;
  langsmithPromptName?: string;
  model?: ModelIdentifier;
  referenceKey?: string;
}

export interface RunEvaluationInput {
  graphName: GraphName;
  datasetName: string;
  selectedCompanyId: string;
  preferredLanguage?: string; // Fall back to user-configured preferredLanguage if not provided
  evaluators: EvaluatorInput[];
  experimentPrefix?: string;
  maxConcurrency?: number; // Max concurrent dataset examples within experiment (default: 10)
  numRepetitions?: number; // Number of times to run each example (default: 1)
}

export interface GetDatasetExperimentsInput {
  datasetId: string;
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortByDesc?: boolean;
}

export interface GetExperimentDetailsInput {
  experimentId: string;
  limit?: number;
  offset?: number;
}

export interface FeedbackSource {
  type: string;
  metadata?: Record<string, any>;
  userId?: string;
  userName?: string;
}

export interface Feedback {
  id: string;
  createdAt: string;
  modifiedAt: string;
  key: string;
  score?: number;
  value?: any;
  comment?: string;
  correction?: string;
  feedbackGroupId?: string;
  comparativeExperimentId?: string;
  runId: string;
  sessionId: string;
  traceId: string;
  startTime: string;
  feedbackSource: FeedbackSource;
  extra?: Record<string, any>;
}

export interface Run {
  id: string;
  name: string;
  runType: string;
  startTime: string;
  endTime?: string;
  latency?: number;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  inputsPreview?: string;
  outputsPreview?: string;
  error?: string;
  parentRunId?: string;
  isRoot: boolean;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
  promptCost?: number;
  completionCost?: number;
  metadata?: Record<string, any>;
  tags?: string[];
  referenceExampleId?: string;
  traceId?: string;
  dottedOrder?: string;
  status?: string;
  executionOrder?: number;
  feedbackStats?: FeedbackStats;
  appPath?: string;
  sessionId?: string;
  // Note: feedback is lazily loaded via GraphQL field resolver
  feedback?: Feedback[];
}

export interface ExperimentDetails {
  experiment: DatasetExperiment;
  runs: Run[];
  totalRuns: number;
}

export interface EvaluatorFeedback {
  n: number;
  avg: number;
  stdev: number;
  errors: number;
  values?: Record<string, any>;
}

export interface FeedbackStats {
  expected_output?: EvaluatorFeedback;
  language_verification?: EvaluatorFeedback;
  allStats?: Record<string, any>; // All feedback stats as flexible JSON, can be filtered
  // Add other evaluators as needed in the future
  [key: string]: EvaluatorFeedback | Record<string, any> | undefined;
}

export interface DatasetExperiment {
  id: string;
  name: string;
  startTime: string;
  endTime?: string;
  description?: string;
  runCount?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
  promptCost?: number;
  completionCost?: number;
  errorRate?: number;
  latencyP50?: number;
  latencyP99?: number;
  feedbackStats?: FeedbackStats;
  testRunNumber?: number;
  metadata?: Record<string, any>;
}

export interface CompanyInfo {
  companyId: string;
  companyName: string;
  companyAvatarUrl?: string;
  role: string;
  managingCompany: boolean;
}

export interface AvailableCompaniesResponse {
  companies: CompanyInfo[];
}

export interface DeleteExperimentRunsInput {
  experimentId: string;
}

export interface DeleteExperimentRunsResult {
  success: boolean;
  message: string;
  deletedCount?: number;
}

// Async evaluation types
export enum EvaluationJobStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export interface AsyncEvaluationResult {
  jobId: string;
  status: EvaluationJobStatus;
  experimentName: string;
  experimentId?: string;
  message: string;
  url?: string;
  createdAt: string;
}

export interface GetEvaluationJobStatusInput {
  jobId: string;
}

export interface EvaluationJobDetails {
  jobId: string;
  status: EvaluationJobStatus;
  experimentName: string;
  experimentId?: string;
  message: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  processedExamples?: number;
  totalExamples?: number;
  errorMessage?: string;
  results?: EvaluationResult;
  usedPrompts?: Record<string, UsedPromptInfo>; // Maps evaluator type to prompt information
}

export interface EvaluationResult {
  url: string;
  experimentName: string;
  experimentId: string;
  results: RunResult[];
}

export interface RunResult {
  id: string;
  inputs: string;
  outputs?: string;
  startTime: string;
  endTime: string;
  latency: number;
  totalTokens: number;
  scores: Score[];
}

export interface Score {
  key: string;
  score: string;
  comment?: string;
}

export interface UsedPromptInfo {
  type: "default" | "custom" | "langsmith";
  content: string;
  source?: string; // For LangSmith prompts, this would be the prompt name
}
