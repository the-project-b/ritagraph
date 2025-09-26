import { Client } from 'langsmith';
import { evaluate } from 'langsmith/evaluation';
import {
  ExperimentProviderAdapter,
  ProviderType,
  ProviderDataset,
  ProviderExample,
  ProviderExperiment,
  ProviderPrompt,
  ListExamplesOptions,
  ExperimentConfig,
  EvaluationConfig,
  EvaluationResults,
  TargetFunction,
} from './provider.adapter.js';

export interface LangSmithConfig {
  apiKey?: string;
  apiUrl?: string;
  projectName?: string;
}

/**
 * LangSmith adapter implementation
 */
export class LangSmithAdapter implements ExperimentProviderAdapter {
  readonly provider = ProviderType.LANGSMITH;
  private client: Client;
  private projectName?: string;

  constructor(config: LangSmithConfig) {
    this.client = new Client({
      apiKey: config.apiKey,
      apiUrl: config.apiUrl,
    });
    this.projectName = config.projectName;
  }

  async getDataset(name: string): Promise<ProviderDataset | null> {
    try {
      const dataset = await this.client.readDataset({ datasetName: name });
      return this.transformDataset(dataset);
    } catch (error: any) {
      if (error?.message?.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  async *listExamples(
    datasetName: string,
    options?: ListExamplesOptions
  ): AsyncIterable<ProviderExample> {
    const examples = this.client.listExamples({
      datasetName,
      splits: options?.splits,
      limit: options?.limit,
      offset: options?.offset,
    });

    for await (const example of examples) {
      yield this.transformExample(example);
    }
  }

  async countExamples(
    datasetName: string,
    splits?: string[]
  ): Promise<number> {
    let count = 0;
    const examples = this.client.listExamples({
      datasetName,
      splits,
    });

    for await (const _ of examples) {
      count++;
    }

    return count;
  }

  async createExperiment(config: ExperimentConfig): Promise<ProviderExperiment> {
    // LangSmith creates experiments implicitly during evaluation
    // Return a mock experiment for now
    return {
      id: `exp_${Date.now()}`,
      name: config.name,
      datasetId: config.datasetId,
      startTime: new Date(),
      metadata: config.metadata,
    };
  }

  async getExperiment(id: string): Promise<ProviderExperiment | null> {
    try {
      // LangSmith doesn't have a direct getExperiment API
      // We'd need to list and filter
      const projectRuns = this.client.listRuns({
        projectName: this.projectName,
        filter: `eq(id, "${id}")`,
        limit: 1,
      });

      for await (const run of projectRuns) {
        return {
          id: run.id,
          name: run.name,
          datasetId: run.reference_example_id || '',
          startTime: new Date(run.start_time),
          endTime: run.end_time ? new Date(run.end_time) : undefined,
          metadata: run.extra,
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async listExperiments(
    datasetId?: string,
    limit?: number,
    offset?: number
  ): Promise<{ experiments: ProviderExperiment[]; total: number }> {
    const experiments: ProviderExperiment[] = [];
    let count = 0;

    const projectRuns = this.client.listRuns({
      projectName: this.projectName,
      limit,
    });

    for await (const run of projectRuns) {
      // Filter by datasetId if provided
      if (!datasetId || run.reference_example_id === datasetId) {
        experiments.push({
          id: run.id,
          name: run.name,
          datasetId: run.reference_example_id || '',
          startTime: new Date(run.start_time),
          endTime: run.end_time ? new Date(run.end_time) : undefined,
          metadata: run.extra,
        });
        count++;
      }
    }

    return { experiments, total: count };
  }

  async deleteExperiment(id: string): Promise<boolean> {
    try {
      // LangSmith doesn't support deleting experiments directly
      // We can only delete individual runs
      console.warn('LangSmith does not support deleting experiments');
      return false;
    } catch (error) {
      return false;
    }
  }

  async runEvaluation(
    target: TargetFunction,
    config: EvaluationConfig
  ): Promise<EvaluationResults> {
    const results = await evaluate(target, {
      data: config.datasetName,
      experimentPrefix: config.experimentName,
      evaluators: config.evaluators,
      maxConcurrency: config.maxConcurrency,
      numRepetitions: config.numRepetitions,
      metadata: config.metadata,
    } as any);

    // Transform LangSmith results to our format
    const runs: any[] = [];
    const experimentId = `exp_${Date.now()}`;

    // Note: The actual structure of results from LangSmith evaluate
    // needs to be determined from runtime inspection
    return {
      experimentId,
      runs,
      url: this.getExperimentUrl(experimentId),
      metadata: results as any,
    };
  }

  async listPrompts(filter?: {
    tags?: string[];
    limit?: number;
  }): Promise<ProviderPrompt[]> {
    try {
      // Make direct API call to LangSmith
      // Use a default URL if client doesn't expose apiUrl
      const apiUrl = 'https://api.smith.langchain.com';
      const response = await fetch(
        `${apiUrl}/prompts?limit=${filter?.limit || 100}`,
        {
          headers: {
            'x-api-key': process.env.LANGSMITH_API_KEY || '',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to list prompts: ${response.statusText}`);
      }

      const data = await response.json();
      return data.map((prompt: any) => this.transformPrompt(prompt));
    } catch (error) {
      console.error('Error listing prompts:', error);
      return [];
    }
  }

  async pullPrompt(name: string): Promise<ProviderPrompt | null> {
    try {
      // Try to use the private method if available
      const prompt = await (this.client as any)._pullPrompt?.(name) || await (this.client as any).pullPrompt?.(name);
      return {
        id: name,
        name,
        template: this.promptToText(prompt),
        variables: this.extractVariables(prompt),
        metadata: prompt as any,
      };
    } catch (error) {
      return null;
    }
  }

  getExperimentUrl(experimentId: string): string {
    const baseUrl = 'https://app.smith.langchain.com';
    const project = this.projectName || 'default';
    return `${baseUrl}/projects/p/${project}/experiments/${experimentId}`;
  }

  private transformDataset(dataset: any): ProviderDataset {
    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      createdAt: dataset.created_at ? new Date(dataset.created_at) : undefined,
      updatedAt: dataset.updated_at ? new Date(dataset.updated_at) : undefined,
      metadata: dataset.metadata,
    };
  }

  private transformExample(example: any): ProviderExample {
    return {
      id: example.id,
      inputs: example.inputs || {},
      outputs: example.outputs,
      metadata: example.metadata,
      split: example.split,
      datasetId: example.dataset_id,
      createdAt: example.created_at ? new Date(example.created_at) : undefined,
    };
  }

  private transformPrompt(prompt: any): ProviderPrompt {
    return {
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      template: prompt.template || '',
      variables: prompt.variables || [],
      metadata: prompt.metadata,
    };
  }

  private promptToText(prompt: any): string {
    if (typeof prompt === 'string') {
      return prompt;
    }
    if (prompt?.template) {
      return prompt.template;
    }
    return JSON.stringify(prompt);
  }

  private extractVariables(prompt: any): string[] {
    const text = this.promptToText(prompt);
    const matches = text.match(/\{([^}]+)\}/g) || [];
    return matches.map(m => m.slice(1, -1));
  }
}