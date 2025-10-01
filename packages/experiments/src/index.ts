/**
 * @the-project-b/experiments
 *
 * DDD-based experiments package with multi-provider support
 */

// Re-export domain layer
export {
  // Value Objects
  DatasetId,
  EvaluationConfig,
  ExperimentId,
  Split,
  // Entities
  Dataset,
  type DatasetMetadata,
  EvaluationRun,
  type FeedbackScore,
  type RunMetrics,
  Example,
  Experiment,
  ExperimentStatus,
  type ExperimentStatistics,
  // Repositories
  type DatasetRepository,
  type ExampleFilter,
  type ExperimentFilter,
  type ExperimentListResult,
  type ExperimentRepository,
  type PromptContent,
  type PromptFilter,
  type PromptInfo,
  type PromptRepository,
  type RitaThreadRepository,
  RitaThread,
  RitaThreadStatus,
  RitaThreadTriggerType,
  RitaThreadItem,
  RitaThreadItemType,
  // Services
  EvaluationService,
  type EvaluationContext,
  type EvaluationResult,
  type EvaluatorDefinition,
} from "./domain/index.js";

// Re-export application layer
export * from "./application/index.js";

// Re-export infrastructure layer
export * from "./infrastructure/index.js";

// Re-export evaluators
export {
  // Registry - single source of truth
  EvaluatorRegistry,
  evaluatorRegistry,
  // Evaluator implementations
  expectedOutputEvaluator,
  languageVerificationEvaluator,
  dataChangeProposalEvaluator,
  titleGenerationEvaluator,
  proposalQuoteVerificationEvaluator,
  // Core types
  type EvaluationOptions,
  type Evaluator,
  type EvaluatorConfig,
  type EvaluationResult as EvaluatorEvaluationResult,
  type EvaluatorInfo,
  type EvaluatorMap,
  type EvaluatorParams,
  type EvaluatorType,
  type ModelIdentifier,
  type ModelProvider,
  type TextEvaluationInputs,
  type TextEvaluationOutputs,
  type TypedEvaluator,
  DataChangeProposal,
} from "./infrastructure/evaluators/index.js";

// Convenience function to create repositories from environment
import { ProviderFactory, type RepositorySet } from "./infrastructure/index.js";
import { type GraphFactory } from "./infrastructure/types/langsmith.types.js";

/**
 * Create repositories and services based on environment configuration
 */
export function createExperimentsFromEnv(
  graphFactory?: GraphFactory,
  graphQLEndpoint?: string,
  getAuthToken?: () => string,
): RepositorySet {
  const config = ProviderFactory.createConfigFromEnv();
  config.graphFactory = graphFactory;
  config.graphQLEndpoint = graphQLEndpoint;
  config.getAuthToken = getAuthToken;
  return ProviderFactory.createRepositories(config);
}

// Convenience function to create use cases
import {
  DeleteExperimentUseCase,
  EvaluationOrchestratorService,
  GetExperimentDetailsUseCase,
  JobManagerService,
  ListExperimentsUseCase,
  RunEvaluationUseCase,
} from "./application/index.js";

export interface UseCases {
  runEvaluation: RunEvaluationUseCase;
  listExperiments: ListExperimentsUseCase;
  getExperimentDetails: GetExperimentDetailsUseCase;
  deleteExperiment: DeleteExperimentUseCase;
}

/**
 * Create all use cases with injected dependencies
 */
export function createUseCases(
  repositories: RepositorySet,
  jobManager?: JobManagerService,
): UseCases {
  const jobManagerInstance = jobManager || new JobManagerService();
  const orchestrator = new EvaluationOrchestratorService(
    repositories.evaluation,
  );

  return {
    runEvaluation: new RunEvaluationUseCase(
      repositories.dataset,
      repositories.experiment,
      repositories.evaluation,
      jobManagerInstance,
      orchestrator,
    ),
    listExperiments: new ListExperimentsUseCase(
      repositories.experiment,
      repositories.dataset,
    ),
    getExperimentDetails: new GetExperimentDetailsUseCase(
      repositories.experiment,
    ),
    deleteExperiment: new DeleteExperimentUseCase(repositories.experiment),
  };
}
