import {
  createExperimentsFromEnv,
  createUseCases,
  EvaluatorRegistry,
  type RepositorySet,
  type UseCases,
} from "@the-project-b/experiments";
import { createLogger } from "@the-project-b/logging";
import { isOk, unwrap, unwrapErr } from "@the-project-b/types";
import { createRitaGraphTarget } from "../graphs/graph-factory.js";
import type { GraphQLContext } from "../types/context.js";
import type {
  DatasetExperiment,
  DeleteExperimentRunsInput,
  DeleteExperimentRunsResult,
  ExperimentDetails,
  GetDatasetExperimentsInput,
  GetExperimentDetailsInput,
  Run,
  RunEvaluationInput,
} from "../types/index.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "ExperimentsService",
});

/**
 * Thin orchestration layer that bridges the GraphQL API with the DDD experiments package
 * Handles auth context and data transformation for GraphQL responses
 */
export class ExperimentsService {
  private repositories: RepositorySet;
  private useCases: UseCases;
  private currentAuthToken: string | undefined;

  constructor() {
    const graphQLEndpoint =
      process.env.PROJECTB_GRAPHQL_ENDPOINT ||
      "http://localhost:3001/graphqlapi";

    const getAuthToken = () => this.currentAuthToken || "";

    this.repositories = createExperimentsFromEnv(
      createRitaGraphTarget,
      graphQLEndpoint,
      getAuthToken,
    );
    this.useCases = createUseCases(this.repositories);
  }

  /**
   * Set the auth token for the current request context
   */
  private setAuthToken(token: string): void {
    this.currentAuthToken = token;
  }

  /**
   * Get experiments for a dataset - transforms DDD results to GraphQL format
   */
  async getDatasetExperiments(
    input: GetDatasetExperimentsInput,
  ): Promise<{ experiments: DatasetExperiment[]; total: number }> {
    try {
      const datasetResult = await this.repositories.dataset.findByName(
        input.datasetId,
      );

      if (!isOk(datasetResult)) {
        logger.error("Dataset not found", {
          datasetId: input.datasetId,
          error: unwrapErr(datasetResult).message,
        });
        return { experiments: [], total: 0 };
      }

      const dataset = unwrap(datasetResult);
      const experimentsResult =
        await this.repositories.experiment.listByDataset(dataset.id, {
          limit: input.limit,
          offset: input.offset,
        });

      if (!isOk(experimentsResult)) {
        logger.error("Failed to list experiments", {
          datasetId: input.datasetId,
          error: unwrapErr(experimentsResult).message,
        });
        return { experiments: [], total: 0 };
      }

      const { experiments, total } = unwrap(experimentsResult);

      // Transform to GraphQL format
      const transformedExperiments: DatasetExperiment[] = experiments.map(
        (exp) => {
          const stats = exp.calculateStatistics();
          return {
            id: exp.id.value,
            name: exp.name,
            startTime: exp.startTime?.toISOString() || new Date().toISOString(),
            endTime: exp.endTime?.toISOString(),
            description: exp.description,
            runCount: stats.totalRuns,
            totalTokens: stats.totalTokens,
            promptTokens: undefined,
            completionTokens: undefined,
            totalCost: stats.totalCost,
            promptCost: undefined,
            completionCost: undefined,
            errorRate: stats.errorRate,
            latencyP50: undefined,
            latencyP99: undefined,
            feedbackStats: stats.feedbackStats || {},
            testRunNumber: undefined,
            metadata: exp.metadata || {},
          };
        },
      );

      return { experiments: transformedExperiments, total };
    } catch (error) {
      logger.error("Unexpected error getting dataset experiments", {
        datasetId: input.datasetId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { experiments: [], total: 0 };
    }
  }

  /**
   * Get details of a specific experiment - transforms DDD results to GraphQL format
   */
  async getExperimentDetails(
    input: GetExperimentDetailsInput,
  ): Promise<ExperimentDetails> {
    const result = await this.useCases.getExperimentDetails.execute({
      experimentId: input.experimentId,
      limit: input.limit,
      offset: input.offset,
    });

    if (!isOk(result)) {
      logger.error("Failed to get experiment details", {
        experimentId: input.experimentId,
        error: unwrapErr(result).message,
      });
      throw new Error(unwrapErr(result).message);
    }

    const details = unwrap(result);

    return {
      experiment: {
        id: details.experiment.id,
        name: details.experiment.name,
        startTime:
          details.experiment.startTime?.toISOString() ||
          new Date().toISOString(),
        endTime: details.experiment.endTime?.toISOString(),
        description: details.experiment.description,
        runCount: details.experiment.runCount,
        totalTokens: details.experiment.totalTokens,
        promptTokens: details.experiment.promptTokens,
        completionTokens: details.experiment.completionTokens,
        totalCost: details.experiment.totalCost,
        promptCost: details.experiment.promptCost,
        completionCost: details.experiment.completionCost,
        errorRate: details.experiment.errorRate,
        latencyP50: details.experiment.latencyP50,
        latencyP99: details.experiment.latencyP99,
        feedbackStats: details.experiment.feedbackStats || {},
        testRunNumber: undefined,
        metadata: details.experiment.metadata || {},
      },
      runs: details.runs.map(
        (run): Run => ({
          id: run.id,
          name: run.name,
          runType: "chain",
          startTime: run.startTime?.toISOString() || new Date().toISOString(),
          endTime: run.endTime?.toISOString(),
          latency: run.latency,
          inputs: run.inputs,
          outputs: run.outputs || {},
          inputsPreview:
            run.inputsPreview ||
            JSON.stringify(run.inputs || {}).substring(0, 100),
          outputsPreview:
            run.outputsPreview ||
            (run.outputs
              ? JSON.stringify(run.outputs).substring(0, 100)
              : undefined),
          error: run.error,
          parentRunId: undefined,
          isRoot: true,
          totalTokens: run.totalTokens,
          promptTokens: run.promptTokens,
          completionTokens: run.completionTokens,
          totalCost: run.totalCost,
          promptCost: run.promptCost,
          completionCost: run.completionCost,
          metadata: run.metadata || {},
          tags: run.tags,
          referenceExampleId: undefined,
          traceId: undefined,
          dottedOrder: undefined,
          status: undefined,
          executionOrder: undefined,
          feedbackStats: run.feedbackStats,
          appPath: undefined,
          sessionId: undefined,
          feedback: [],
        }),
      ),
      totalRuns: details.totalRuns,
    };
  }

  /**
   * Delete runs from an experiment
   */
  async deleteExperimentRuns(
    input: DeleteExperimentRunsInput,
  ): Promise<DeleteExperimentRunsResult> {
    const result = await this.useCases.deleteExperiment.execute({
      experimentId: input.experimentId,
    });

    if (!isOk(result)) {
      logger.error("Failed to delete experiment", {
        experimentId: input.experimentId,
        error: unwrapErr(result).message,
      });
      return {
        success: false,
        message: unwrapErr(result).message,
      };
    }

    return {
      success: true,
      message: `Experiment ${input.experimentId} deleted successfully`,
      deletedCount: 0,
    };
  }

  /**
   * Run an evaluation with auth context
   */
  async runEvaluation(input: RunEvaluationInput, context: GraphQLContext) {
    // Set the auth token for thread repository
    this.setAuthToken(context.token || "");

    const result = await this.useCases.runEvaluation.execute(
      {
        graphName: input.graphName,
        datasetName: input.datasetName,
        splits: input.splits,
        selectedCompanyId: input.selectedCompanyId,
        preferredLanguage: input.preferredLanguage,
        evaluators: input.evaluators,
        experimentPrefix: input.experimentPrefix,
        maxConcurrency: input.maxConcurrency,
        numRepetitions: input.numRepetitions,
      },
      {
        token: context.token || "",
        userId: context.user?.auth0?.id || "",
        companyId: input.selectedCompanyId,
        user: context.user?.me
          ? {
              preferredLanguage: context.user.me.preferredLanguage,
              firstName: context.user.me.firstName,
              lastName: context.user.me.lastName,
              email: context.user.me.email,
            }
          : undefined,
      },
    );

    if (!isOk(result)) {
      throw new Error(unwrapErr(result).message);
    }

    const evaluationResult = unwrap(result);

    return {
      url: evaluationResult.url || "",
      experimentName: evaluationResult.experimentName,
      experimentId: evaluationResult.experimentId,
      results: [],
    };
  }

  /**
   * Get available evaluators from the registry
   */
  async getAvailableEvaluators() {
    // Get all evaluators from the registry - single source of truth
    const evaluators = EvaluatorRegistry.getAll();

    // Transform to match the GraphQL schema
    return evaluators.map((evaluator) => ({
      type: evaluator.config.type,
      name: evaluator.config.name,
      description: evaluator.config.description,
      supportsCustomPrompt: evaluator.config.supportsCustomPrompt,
      supportsReferenceKey: evaluator.config.supportsReferenceKey,
      defaultModel: evaluator.config.defaultModel,
    }));
  }

  /**
   * Simple repository delegations used by job manager
   */
  async datasetExists(datasetName: string): Promise<boolean> {
    return this.repositories.dataset.exists(datasetName);
  }

  async countExamples(datasetName: string, splits?: string[]): Promise<number> {
    const datasetResult =
      await this.repositories.dataset.findByName(datasetName);

    if (!isOk(datasetResult)) {
      return 0;
    }

    const dataset = unwrap(datasetResult);
    return this.repositories.dataset.countExamples(dataset.id, splits);
  }
}
