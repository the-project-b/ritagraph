// Graph names supported by this evaluator service
export type GraphName = 'rita';

// Re-export context types
export type { GraphQLContext } from './context.js';

export interface EvaluatorInput {
  type: 'CORRECTNESS';
  customPrompt?: string;
  model?: string;
  referenceKey?: string;
}

export interface RunEvaluationInput {
  graphName: GraphName;
  datasetName: string;
  selectedCompanyId: string;
  preferredLanguage?: string; // Fall back to user-configured preferredLanguage if not provided
  evaluators: EvaluatorInput[];
  experimentPrefix?: string;
  inputKey?: string;
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
  correctness?: EvaluatorFeedback;
  // Add other evaluators as needed in the future
  [key: string]: EvaluatorFeedback | undefined;
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