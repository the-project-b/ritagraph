// Import EvaluationResult from LangSmith SDK
import type { EvaluationResult } from "langsmith/evaluation";

// Model provider types
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

// Full model identifier (e.g., 'openai:gpt-4o', 'anthropic:claude-3-5-sonnet-20241022')
export type ModelIdentifier =
  | `${ModelProvider}:${string}`
  | OpenAIModel
  | AnthropicModel;

// Evaluation data types - using generics for flexibility while maintaining type safety
export interface EvaluatorParams<
  TInputs = Record<string, unknown>,
  TOutputs = Record<string, unknown>,
  TReferenceOutputs = Record<string, unknown>,
> {
  inputs: TInputs;
  outputs: TOutputs;
  referenceOutputs?: TReferenceOutputs;
}

// Re-export EvaluationResult for backward compatibility
export type { EvaluationResult };
// Alias for backward compatibility (to be removed in future)
export type EvaluatorResult = EvaluationResult;

// Options passed to evaluator evaluate function
export interface EvaluationOptions {
  readonly customPrompt?: string;
  readonly model?: ModelIdentifier;
  readonly referenceKey?: string;
}

// Configuration for an evaluator
export interface EvaluatorConfig {
  readonly type: string;
  readonly name: string;
  readonly description: string;
  readonly defaultModel: ModelIdentifier;
  readonly supportsCustomPrompt: boolean;
  readonly supportsReferenceKey: boolean;
  readonly requiredReferenceKeys?: readonly string[]; // Keys that must exist in reference outputs for evaluator to run
}

// Public information about an evaluator (same as config for now, but semantically different)
export type EvaluatorInfo = EvaluatorConfig;

// Base evaluator interface
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

// Type for evaluator implementations - allows for specific typing per evaluator
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

// Helper type for extracting evaluator type from config
export type EvaluatorType<T extends Evaluator> = T["config"]["type"];

// Registry map type
export type EvaluatorMap = ReadonlyMap<string, Evaluator>;

// Common input/output schemas for different types of evaluations
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
