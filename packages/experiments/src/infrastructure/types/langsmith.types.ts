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
 * Conversation message for multi-turn evaluation
 *
 * Design decisions:
 * - USER messages: Actual user input to RITA
 * - ASSISTANT messages: Turn markers indicating where RITA should respond
 *   - content: Optional description of expected RITA behavior (for human documentation)
 *   - Future: Used by evaluators to grade response quality
 * - SYSTEM messages: System instructions (rarely used in evaluations)
 *
 * Future extension: userId field for multi-user thread support
 *
 * Follows OpenAI format and LangSmith standard:
 * Schema: https://api.smith.langchain.com/public/schemas/v1/message.json
 */
export interface ConversationMessage {
  /** Message role */
  role: "user" | "assistant" | "system";

  /**
   * Message content
   * - user: Actual user input
   * - assistant: Description of expected RITA behavior (optional, can be empty string)
   * - system: System instructions
   */
  content: string;

  /** Optional: User ID for future multi-user thread support */
  userId?: string;

  /** Optional: Display name */
  name?: string;

  /** Optional: Metadata for extensibility */
  metadata?: {
    turnNumber?: number;
    timestamp?: string;
    [key: string]: unknown;
  };
}

/**
 * Graph input structure
 * Uses ConversationMessage for strong typing
 */
export interface GraphInput extends Record<string, unknown> {
  messages: ConversationMessage[];
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
  messages?: ConversationMessage[];
  [key: string]: unknown;
}

/**
 * Evaluator input/output types for LangSmith evaluation
 * Supports both single-turn (question) and multi-turn (messages)
 */
export interface EvaluatorInput {
  question?: string;
  messages?: ConversationMessage[];
  preferredLanguage?: string;
  [key: string]: unknown;
}

export interface EvaluatorOutput {
  answer: string;
  dataChangeProposals?: Array<Record<string, unknown>>;
  threadTitle?: string;
  preferredLanguage?: string;
  processedInput?: string;
  // Multi-turn specific fields
  conversationTrajectory?: ConversationMessage[];
  turnOutputs?: ConversationTurnOutput[];
  threadId?: string;
  [key: string]: unknown;
}

export interface EvaluatorReferenceOutput {
  expectedDataProposal?:
    | Array<Record<string, unknown>>
    | Record<string, unknown>;
  expectedAnswer?: string;
  reference?: string;
  expectedLanguage?: string;
  // Multi-turn specific fields
  expectedConversationFlow?: string;
  expectedTurnCount?: number;
  expected_result_description?: string;
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

/**
 * Multi-turn input from dataset
 */
export interface MultiTurnInput {
  messages: ConversationMessage[];
  preferredLanguage?: string;
}

/**
 * Output for a single turn in a multi-turn conversation
 */
export interface ConversationTurnOutput {
  turnNumber: number;
  userMessage: string;
  assistantResponse: string;
  /** Optional: Expected behavior from dataset (for future evaluators) */
  expectedBehavior?: string;
}

/**
 * Result from multi-turn target function
 */
export interface MultiTurnTargetFunctionResult {
  /** Full conversation trajectory (for trajectory evaluators) */
  conversationTrajectory: ConversationMessage[];

  /** Per-turn outputs (for detailed analysis) */
  turnOutputs: ConversationTurnOutput[];

  /** Final turn output (for turn-based evaluators) */
  answer: string;
  dataChangeProposals: Array<Record<string, unknown>>;
  threadTitle: string | null;

  /** Metadata */
  threadId: string;
  processedInput: string;
}
