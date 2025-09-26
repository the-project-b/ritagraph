import { Result } from '@the-project-b/types';

export enum ProviderType {
  LANGSMITH = 'langsmith',
  LANGFUSE = 'langfuse',
}

export interface ProviderDataset {
  id: string;
  name: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, any>;
}

export interface ProviderExample {
  id: string;
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  metadata?: Record<string, any>;
  split?: string;
  datasetId?: string;
  createdAt?: Date;
}

export interface ProviderExperiment {
  id: string;
  name: string;
  datasetId: string;
  startTime: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
}

export interface ProviderPrompt {
  id: string;
  name: string;
  description?: string;
  template: string;
  variables?: string[];
  metadata?: Record<string, any>;
}

export interface ListExamplesOptions {
  splits?: string[];
  limit?: number;
  offset?: number;
}

export interface ExperimentConfig {
  name: string;
  datasetId: string;
  metadata?: Record<string, any>;
}

export interface EvaluationConfig {
  datasetName: string;
  experimentName?: string;
  evaluators: any[];
  maxConcurrency?: number;
  numRepetitions?: number;
  metadata?: Record<string, any>;
}

export interface EvaluationResults {
  experimentId: string;
  runs: any[];
  url?: string;
  metadata?: Record<string, any>;
}

export type TargetFunction = (example: ProviderExample) => Promise<any>;

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
    options?: ListExamplesOptions
  ): AsyncIterable<ProviderExample>;

  countExamples(
    datasetName: string,
    splits?: string[]
  ): Promise<number>;

  /**
   * Experiment operations
   */
  createExperiment(config: ExperimentConfig): Promise<ProviderExperiment>;

  getExperiment(id: string): Promise<ProviderExperiment | null>;

  listExperiments(
    datasetId?: string,
    limit?: number,
    offset?: number
  ): Promise<{ experiments: ProviderExperiment[]; total: number }>;

  deleteExperiment(id: string): Promise<boolean>;

  /**
   * Evaluation operations
   */
  runEvaluation(
    target: TargetFunction,
    config: EvaluationConfig
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