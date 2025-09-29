import {
  DatasetRepository,
  ExperimentRepository,
  PromptRepository,
  EvaluationService,
} from "../../domain/index.js";
import {
  ExperimentProviderAdapter,
  ProviderType,
} from "../adapters/provider.adapter.js";
import { LangSmithAdapter } from "../adapters/langsmith.adapter.js";
import { LangFuseAdapter } from "../adapters/langfuse.adapter.js";
import { LangSmithDatasetRepository } from "../repositories/langsmith/langsmith-dataset.repository.js";
import { LangSmithExperimentRepository } from "../repositories/langsmith/langsmith-experiment.repository.js";
import { LangSmithPromptRepository } from "../repositories/langsmith/langsmith-prompt.repository.js";
import { LangFuseDatasetRepository } from "../repositories/langfuse/langfuse-dataset.repository.js";
import { LangFuseExperimentRepository } from "../repositories/langfuse/langfuse-experiment.repository.js";
import { LangFusePromptRepository } from "../repositories/langfuse/langfuse-prompt.repository.js";
import { LangSmithEvaluationService } from "../services/langsmith-evaluation.service.js";
import { LangFuseEvaluationService } from "../services/langfuse-evaluation.service.js";

import { RitaThreadRepository } from "../../domain/repositories/rita-thread.repository.js";
import { GraphQLRitaThreadRepository } from "../repositories/graphql/graphql-rita-thread.repository.js";
import { GraphFactory } from "../types/langsmith.types.js";

export interface ProviderConfig {
  type: ProviderType;
  langsmith?: {
    apiKey?: string;
    apiUrl?: string;
    projectName?: string;
  };
  langfuse?: {
    publicKey: string;
    secretKey: string;
    host?: string;
  };
  graphFactory?: GraphFactory;
  graphQLEndpoint?: string;
  getAuthToken?: () => string;
}

export interface RepositorySet {
  dataset: DatasetRepository;
  experiment: ExperimentRepository;
  prompt: PromptRepository;
  evaluation: EvaluationService;
  thread?: RitaThreadRepository;
}

/**
 * Factory for creating provider adapters and repositories
 */
export class ProviderFactory {
  private static adapters = new Map<ProviderType, ExperimentProviderAdapter>();

  /**
   * Register an adapter
   */
  static registerAdapter(
    type: ProviderType,
    adapter: ExperimentProviderAdapter,
  ): void {
    this.adapters.set(type, adapter);
  }

  /**
   * Get an adapter
   */
  static getAdapter(type: ProviderType): ExperimentProviderAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${type}`);
    }
    return adapter;
  }

  /**
   * Create adapter from config
   */
  static createAdapter(config: ProviderConfig): ExperimentProviderAdapter {
    switch (config.type) {
      case ProviderType.LANGSMITH:
        if (!config.langsmith) {
          throw new Error("LangSmith configuration required");
        }
        return new LangSmithAdapter(config.langsmith);

      case ProviderType.LANGFUSE:
        if (!config.langfuse) {
          throw new Error("LangFuse configuration required");
        }
        return new LangFuseAdapter(config.langfuse);

      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }

  /**
   * Create repositories for a provider
   */
  static createRepositories(config: ProviderConfig): RepositorySet {
    const adapter = this.createAdapter(config);
    this.registerAdapter(config.type, adapter);

    // Create thread repository if GraphQL endpoint is provided
    let threadRepository: RitaThreadRepository | undefined;
    if (config.graphQLEndpoint && config.getAuthToken) {
      threadRepository = new GraphQLRitaThreadRepository(
        config.graphQLEndpoint,
        config.getAuthToken,
      );
    }

    switch (config.type) {
      case ProviderType.LANGSMITH: {
        const langsmithAdapter = adapter as LangSmithAdapter;
        return {
          dataset: new LangSmithDatasetRepository(langsmithAdapter),
          experiment: new LangSmithExperimentRepository(langsmithAdapter),
          prompt: new LangSmithPromptRepository(langsmithAdapter),
          evaluation: new LangSmithEvaluationService(
            langsmithAdapter,
            config.graphFactory,
            threadRepository,
          ),
          thread: threadRepository,
        };
      }

      case ProviderType.LANGFUSE: {
        const langfuseAdapter = adapter as LangFuseAdapter;
        return {
          dataset: new LangFuseDatasetRepository(langfuseAdapter),
          experiment: new LangFuseExperimentRepository(langfuseAdapter),
          prompt: new LangFusePromptRepository(langfuseAdapter),
          evaluation: new LangFuseEvaluationService(
            langfuseAdapter,
            config.graphFactory,
            threadRepository,
          ),
          thread: threadRepository,
        };
      }

      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }

  /**
   * Get current provider type from environment
   */
  static getProviderType(): ProviderType {
    const provider = process.env.EXPERIMENTS_PROVIDER?.toLowerCase();

    switch (provider) {
      case "langsmith":
        return ProviderType.LANGSMITH;
      case "langfuse":
        return ProviderType.LANGFUSE;
      default:
        // Default to LangSmith for backward compatibility
        return ProviderType.LANGSMITH;
    }
  }

  /**
   * Create config from environment variables
   */
  static createConfigFromEnv(): ProviderConfig {
    const type = this.getProviderType();

    switch (type) {
      case ProviderType.LANGSMITH:
        return {
          type,
          langsmith: {
            apiKey: process.env.LANGSMITH_API_KEY,
            apiUrl: process.env.LANGSMITH_ENDPOINT,
            projectName: process.env.LANGSMITH_PROJECT,
          },
        };

      case ProviderType.LANGFUSE:
        return {
          type,
          langfuse: {
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            secretKey: process.env.LANGFUSE_SECRET_KEY,
            host: process.env.LANGFUSE_HOST,
          },
        };

      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }
}
