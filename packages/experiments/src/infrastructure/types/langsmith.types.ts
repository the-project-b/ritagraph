/**
 * LangSmith-specific type definitions
 */

/**
 * LangSmith example structure
 */
export interface LangSmithExample {
  id: string;
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  metadata?: {
    dataset_split?: string | string[];
  };
  split?: string | string[];
}

/**
 * LangSmith evaluation results
 */
export interface LangSmithEvaluationResults {
  experimentId?: string;
  experimentName?: string;
  results?: Array<{
    runId: string;
    exampleId: string;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    error?: string;
    feedback?: Array<{
      key: string;
      score?: number;
      value?: unknown;
      comment?: string;
    }>;
  }>;
  manager?: {
    _experiment?: {
      id: string;
      name: string;
    };
  };
}

/**
 * Graph factory context
 */
export interface GraphFactoryContext {
  token: string;
  userId: string;
  companyId: string;
}

/**
 * Graph instance with invoke method
 */
export interface GraphInstance {
  invoke(
    input: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

/**
 * Graph factory function type
 */
export type GraphFactory = (
  context: GraphFactoryContext,
) => Promise<GraphInstance>;

/**
 * Graph input structure
 */
export interface GraphInput extends Record<string, unknown> {
  messages: Array<{
    role: string;
    content: string;
  }>;
  preferredLanguage?: string;
  selectedCompanyId: string;
}

/**
 * Graph configuration
 */
export interface GraphConfig extends Record<string, unknown> {
  configurable: {
    thread_id: string;
    langgraph_auth_user: {
      token: string;
      user: {
        firstName: string;
        lastName: string;
        preferredLanguage: string;
        company: {
          id: string;
        };
      };
    };
  };
}

/**
 * Graph output structure
 */
export interface GraphOutput {
  messages?: Array<{
    role?: string;
    content?: string;
  }>;
  [key: string]: unknown;
}

/**
 * Evaluator input/output types for LangSmith evaluation
 */
export interface EvaluatorInput {
  question: string;
  preferredLanguage?: string;
  [key: string]: unknown;
}

export interface EvaluatorOutput {
  answer: string;
  dataChangeProposals?: Array<Record<string, unknown>>;
  threadTitle?: string;
  preferredLanguage?: string;
  processedInput?: string;
  [key: string]: unknown;
}

export interface EvaluatorReferenceOutput {
  expectedDataProposal?:
    | Array<Record<string, unknown>>
    | Record<string, unknown>;
  expectedAnswer?: string;
  reference?: string;
  expectedLanguage?: string;
  [key: string]: unknown;
}

/**
 * Target function input (from LangSmith examples)
 */
export type TargetFunctionInput = Pick<
  EvaluatorInput,
  "question" | "preferredLanguage"
>;

/**
 * Target function result
 */
export interface TargetFunctionResult {
  answer: string;
  dataChangeProposals: Array<Record<string, unknown>>;
  threadTitle: string | null;
  processedInput?: string;
}

/**
 * LangSmith evaluate options
 */
export interface LangSmithEvaluateOptions {
  data: string | AsyncIterable<LangSmithExample>;
  experimentPrefix?: string;
  evaluators: EvaluatorFunction[];
  maxConcurrency?: number;
  numRepetitions?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Evaluator function type for LangSmith
 * Note: LangSmith SDK passes plural names (inputs, outputs, referenceOutputs)
 */
export type EvaluatorFunction = (params: {
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}) => Promise<{
  key: string;
  score?: number;
  value?: unknown;
  comment?: string;
}>;

/**
 * Data source for LangSmith evaluation
 */
export type LangSmithDataSource = string | AsyncIterable<LangSmithExample>;
