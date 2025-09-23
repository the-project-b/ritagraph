// GraphQL resolver types for better type safety

import type {
  Run,
  DatasetExperiment,
  GetDatasetExperimentsInput,
  GetExperimentDetailsInput,
  RunEvaluationInput,
  DeleteExperimentRunsInput,
  CompanyInfo,
  AsyncEvaluationResult,
  GetEvaluationJobStatusInput,
  EvaluationJobDetails,
  EvaluationResult,
} from "../types/index";
import type { GraphQLContext } from "../types/context";

// Parent types for GraphQL resolvers
export interface RunParent {
  readonly id: string;
  readonly name: string;
  readonly runType: string;
  readonly startTime: string;
  readonly endTime?: string;
  readonly latency?: number;
  readonly inputs?: Record<string, unknown>;
  readonly outputs?: Record<string, unknown>;
  readonly inputsPreview?: string;
  readonly outputsPreview?: string;
  readonly error?: string;
  readonly parentRunId?: string;
  readonly isRoot: boolean;
  readonly totalTokens?: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalCost?: number;
  readonly promptCost?: number;
  readonly completionCost?: number;
  readonly metadata?: Record<string, unknown>;
  readonly tags?: readonly string[];
  readonly referenceExampleId?: string;
  readonly traceId?: string;
  readonly dottedOrder?: string;
  readonly status?: string;
  readonly executionOrder?: number;
  readonly feedbackStats?: any; // TODO: Type this better
  readonly appPath?: string;
  readonly sessionId?: string;
}

// Resolver function types
export type FieldResolver<TParent, TArgs, TResult> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
) => Promise<TResult> | TResult;

export type QueryResolver<TArgs, TResult> = (
  parent: undefined,
  args: TArgs,
  context: GraphQLContext,
) => Promise<TResult> | TResult;

export type MutationResolver<TArgs, TResult> = (
  parent: undefined,
  args: TArgs,
  context: GraphQLContext,
) => Promise<TResult> | TResult;

// Specific resolver types
export type RunFeedbackResolver = FieldResolver<
  RunParent,
  Record<string, never>,
  Run["feedback"]
>;

export type GetDatasetExperimentsResolver = QueryResolver<
  { input: GetDatasetExperimentsInput },
  { experiments: DatasetExperiment[]; total: number }
>;

export type GetExperimentDetailsResolver = QueryResolver<
  { input: GetExperimentDetailsInput },
  { experiment: DatasetExperiment; runs: Run[]; totalRuns: number }
>;

export type GetAvailableEvaluatorsResolver = QueryResolver<
  Record<string, never>,
  {
    evaluators: Array<{
      type: string;
      name: string;
      description: string;
      defaultModel: string;
      supportsCustomPrompt: boolean;
      supportsReferenceKey: boolean;
    }>;
  }
>;

export type GetAvailableGraphsResolver = QueryResolver<
  Record<string, never>,
  readonly string[]
>;

export type GetAvailableCompaniesResolver = QueryResolver<
  Record<string, never>,
  { companies: CompanyInfo[] }
>;

export type RunEvaluationResolver = MutationResolver<
  { input: RunEvaluationInput },
  EvaluationResult
>;

export type RunEvaluationAsyncResolver = MutationResolver<
  { input: RunEvaluationInput },
  AsyncEvaluationResult
>;

export type GetEvaluationJobStatusResolver = QueryResolver<
  { input: GetEvaluationJobStatusInput },
  EvaluationJobDetails
>;

export type ListLangSmithPromptsResolver = QueryResolver<
  { input?: { query?: string; isPublic?: boolean } },
  {
    prompts: Array<{
      id: string;
      name: string;
      description?: string;
      isPublic: boolean;
      numCommits: number;
      numLikes: number;
      updatedAt: string;
      owner: string;
      fullName: string;
      tags?: string[];
    }>;
  }
>;

export type DeleteExperimentRunsResolver = MutationResolver<
  { input: DeleteExperimentRunsInput },
  { success: boolean; message: string; deletedCount?: number }
>;

export type GetAllJobsResolver = QueryResolver<
  Record<string, never>,
  Array<{
    jobId: string;
    status: string;
    experimentName: string;
    createdAt: string;
  }>
>;

// FeedbackStats resolver types
export type FeedbackStatsAllStatsResolver = FieldResolver<
  any,
  { evaluators?: string[] },
  Record<string, any>
>;

// Resolver map type
export interface Resolvers {
  FeedbackStats: {
    allStats: FeedbackStatsAllStatsResolver;
  };
  Run: {
    feedback: RunFeedbackResolver;
  };
  Query: {
    healthCheck: QueryResolver<Record<string, never>, string>;
    getDatasetExperiments: GetDatasetExperimentsResolver;
    getExperimentDetails: GetExperimentDetailsResolver;
    getAvailableEvaluators: GetAvailableEvaluatorsResolver;
    getAvailableGraphs: GetAvailableGraphsResolver;
    getAvailableCompanies: GetAvailableCompaniesResolver;
    getEvaluationJobStatus: GetEvaluationJobStatusResolver;
    listLangSmithPrompts: ListLangSmithPromptsResolver;
    getAllJobs: GetAllJobsResolver;
  };
  Mutation: {
    // runEvaluation: RunEvaluationResolver;
    runEvaluationAsync: RunEvaluationAsyncResolver;
    deleteExperimentRuns: DeleteExperimentRunsResolver;
  };
}
