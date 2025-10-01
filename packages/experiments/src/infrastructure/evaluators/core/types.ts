/**
 * Core types for evaluator system
 */

export type ModelProvider = "openai" | "anthropic" | "google" | "azure";
export type OpenAIModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "gpt-3.5-turbo";
export type AnthropicModel =
  | "claude-3-5-sonnet-20241022"
  | "claude-3-opus-20240229"
  | "claude-3-haiku-20240307";

export type ModelIdentifier =
  | `${ModelProvider}:${string}`
  | OpenAIModel
  | AnthropicModel;

export interface EvaluatorParams<
  TInputs = Record<string, unknown>,
  TOutputs = Record<string, unknown>,
  TReferenceOutputs = Record<string, unknown>,
> {
  inputs: TInputs;
  outputs: TOutputs;
  referenceOutputs?: TReferenceOutputs;
}

export interface EvaluationResult {
  key: string;
  score: number;
  comment?: string;
  value?: unknown;
}

export interface EvaluationOptions {
  readonly customPrompt?: string;
  readonly model?: ModelIdentifier;
  readonly referenceKey?: string;
}

export interface EvaluatorConfig {
  readonly type: string;
  readonly name: string;
  readonly description: string;
  readonly defaultModel: ModelIdentifier;
  readonly supportsCustomPrompt: boolean;
  readonly supportsReferenceKey: boolean;
  readonly requiredReferenceKeys?: readonly string[];
}

export type EvaluatorInfo = EvaluatorConfig;

export interface Evaluator<
  TInputs = Record<string, unknown>,
  TOutputs = Record<string, unknown>,
  TReferenceOutputs = Record<string, unknown>,
> {
  readonly config: EvaluatorConfig;
  evaluate(
    params: EvaluatorParams<TInputs, TOutputs, TReferenceOutputs>,
    options?: EvaluationOptions,
  ): Promise<EvaluationResult>;
}

export interface TypedEvaluator<
  TType extends string,
  TInputs = Record<string, unknown>,
  TOutputs = Record<string, unknown>,
  TReferenceOutputs = Record<string, unknown>,
> extends Evaluator<TInputs, TOutputs, TReferenceOutputs> {
  readonly config: EvaluatorConfig & {
    readonly type: TType;
  };
}

export type EvaluatorType<T extends Evaluator> = T["config"]["type"];

export type EvaluatorMap = ReadonlyMap<string, Evaluator>;

export interface TextEvaluationInputs {
  readonly question?: string;
  readonly prompt?: string;
  readonly context?: string;
}

export interface TextEvaluationOutputs {
  readonly answer?: string;
  readonly response?: string;
  readonly result?: string;
}

export interface CodeEvaluationInputs extends TextEvaluationInputs {
  readonly code?: string;
  readonly language?: string;
}

export interface CodeEvaluationOutputs extends TextEvaluationOutputs {
  readonly code?: string;
  readonly output?: string;
  readonly error?: string;
}

/**
 * Trajectory evaluation types for multi-turn conversations
 */
import type {
  ConversationMessage,
  ConversationTurnOutput,
} from "../../types/langsmith.types.js";

export interface TrajectoryEvaluationInputs {
  readonly messages: ConversationMessage[];
}

export interface TrajectoryEvaluationOutputs {
  readonly conversationTrajectory: ConversationMessage[];
  readonly turnOutputs: ConversationTurnOutput[];
  readonly answer: string;
}

export interface TrajectoryEvaluationReferenceOutputs {
  readonly expectedConversationFlow?: string;
  readonly expectedTurnCount?: number;
  readonly expected_result_description?: string;
}