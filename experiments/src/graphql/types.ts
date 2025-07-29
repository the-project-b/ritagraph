// GraphQL resolver types for better type safety

import type { 
  Run, 
  DatasetExperiment, 
  GetDatasetExperimentsInput,
  GetExperimentDetailsInput,
  RunEvaluationInput,
  DeleteExperimentRunsInput,
  CompanyInfo
} from '../types/index';
import type { GraphQLContext } from '../types/context';

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
  context: GraphQLContext
) => Promise<TResult> | TResult;

export type QueryResolver<TArgs, TResult> = (
  parent: undefined,
  args: TArgs,
  context: GraphQLContext
) => Promise<TResult> | TResult;

export type MutationResolver<TArgs, TResult> = (
  parent: undefined,
  args: TArgs,
  context: GraphQLContext
) => Promise<TResult> | TResult;

// Specific resolver types
export type RunFeedbackResolver = FieldResolver<
  RunParent,
  Record<string, never>,
  Run['feedback']
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
  { evaluators: Array<{ type: string; name: string; description: string; defaultModel: string; supportsCustomPrompt: boolean; supportsReferenceKey: boolean }> }
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
  { url: string; experimentName: string; results: any[] } // TODO: Type results better
>;

export type DeleteExperimentRunsResolver = MutationResolver<
  { input: DeleteExperimentRunsInput },
  { success: boolean; message: string; deletedCount?: number }
>;

// Resolver map type
export interface Resolvers {
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
  };
  Mutation: {
    runEvaluation: RunEvaluationResolver;
    deleteExperimentRuns: DeleteExperimentRunsResolver;
  };
}