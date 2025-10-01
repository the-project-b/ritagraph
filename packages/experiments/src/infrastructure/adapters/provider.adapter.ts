export enum ProviderType {
  LANGSMITH = "langsmith",
  LANGFUSE = "langfuse",
}

export interface ProviderDataset {
  id: string;
  name: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ProviderExample {
  id: string;
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  splits?: string[]; // Changed to array to support multiple splits
  datasetId?: string;
  createdAt?: Date;
}

export interface ProviderExperiment {
  id: string;
  name: string;
  datasetId: string;
  startTime: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
}

export interface ProviderPrompt {
  id: string;
  name: string;
  description?: string;
  template: string;
  variables?: string[];
  metadata?: Record<string, unknown>;
}

export interface ListExamplesOptions {
  splits?: string[];
  limit?: number;
  offset?: number;
}

export interface ExperimentConfig {
  name: string;
  datasetId: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluationConfig {
  datasetName: string;
  experimentName?: string;
  evaluators: Array<{ type: string; customPrompt?: string; referenceKey?: string; model?: string; }>;
  maxConcurrency?: number;
  numRepetitions?: number;
  metadata?: Record<string, unknown>;
}

export interface EvaluationResults {
  experimentId: string;
  runs: Array<Record<string, unknown>>;
  url?: string;
  metadata?: Record<string, unknown>;
}

export type TargetFunction = (example: ProviderExample) => Promise<Record<string, unknown>>;

/**
 * Base interface for experiment provider adapters
 */
export interface ExperimentProviderAdapter {
  readonly provider: ProviderType;

  /**
   * Dataset operations
   */
  getDataset(name: string): Promise<ProviderDataset | null>;

  listExamples(
    datasetName: string,
    options?: ListExamplesOptions,
  ): AsyncIterable<ProviderExample>;

  countExamples(datasetName: string, splits?: string[]): Promise<number>;

  /**
   * Experiment operations
   */
  createExperiment(config: ExperimentConfig): Promise<ProviderExperiment>;

  getExperiment(id: string): Promise<ProviderExperiment | null>;

  listExperiments(
    datasetId?: string,
    limit?: number,
    offset?: number,
  ): Promise<{ experiments: ProviderExperiment[]; total: number }>;

  deleteExperiment(id: string): Promise<boolean>;

  /**
   * Evaluation operations
   */
  runEvaluation(
    target: TargetFunction,
    config: EvaluationConfig,
  ): Promise<EvaluationResults>;

  /**
   * Prompt operations (optional - not all providers support this)
   */
  listPrompts?(filter?: {
    tags?: string[];
    limit?: number;
  }): Promise<ProviderPrompt[]>;

  pullPrompt?(name: string): Promise<ProviderPrompt | null>;

  /**
   * Get the base URL for viewing experiments
   */
  getExperimentUrl(experimentId: string): string;
}
