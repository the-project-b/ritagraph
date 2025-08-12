import { randomUUID } from "crypto";
import { evaluate } from "langsmith/evaluation";
import { createLogger } from "@the-project-b/logging";
import {
  AsyncEvaluationResult,
  EvaluationJobDetails,
  EvaluationJobStatus,
  EvaluationResult,
  RunEvaluationInput,
  UsedPromptInfo,
} from "../types/index.js";
import type { GraphQLContext } from "../types/context.js";
import {
  RitaThreadStatus,
  RitaThreadTriggerType,
} from "@the-project-b/rita-graphs";
import { createGraphQLClient } from "../graphql/index.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "EvaluationJobManager",
});

interface JobData {
  jobId: string;
  status: EvaluationJobStatus;
  experimentName: string;
  experimentId?: string;
  message: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  processedExamples?: number;
  totalExamples?: number;
  errorMessage?: string;
  results?: EvaluationResult;
  input: RunEvaluationInput;
  context: GraphQLContext;
  usedPrompts?: Record<string, UsedPromptInfo>; // Maps evaluator type to prompt information
}

/**
 * Manages asynchronous evaluation jobs with configurable example-level concurrency control
 */
export class EvaluationJobManager {
  private static instance: EvaluationJobManager;
  private jobs: Map<string, JobData> = new Map();

  static getInstance(): EvaluationJobManager {
    if (!EvaluationJobManager.instance) {
      EvaluationJobManager.instance = new EvaluationJobManager();
    }
    return EvaluationJobManager.instance;
  }

  /**
   * Start a new asynchronous evaluation job
   */
  async startEvaluationJob(
    input: RunEvaluationInput,
    context: GraphQLContext,
  ): Promise<AsyncEvaluationResult> {
    // Verify dataset exists before creating the job
    const { LangSmithService } = await import("../langsmith/service.js");
    const langsmithService = new LangSmithService();

    const datasetExists = await langsmithService.getDataset(input.datasetName);
    if (!datasetExists) {
      const errorMessage = `Dataset "${input.datasetName}" does not exist in LangSmith. Please verify the dataset name and try again.`;
      logger.error(errorMessage, {
        operation: "startEvaluationJob",
        datasetName: input.datasetName,
        graphName: input.graphName,
      });
      throw new Error(errorMessage);
    }

    const jobId = randomUUID();
    const experimentName = input.experimentPrefix
      ? `${input.experimentPrefix}-${Date.now()}`
      : `eval-${input.graphName}-${Date.now()}`;

    const now = new Date().toISOString();

    // Create job record
    const jobData: JobData = {
      jobId,
      status: EvaluationJobStatus.QUEUED,
      experimentName,
      message: "Evaluation job queued and will start shortly",
      createdAt: now,
      updatedAt: now,
      input,
      context,
    };

    this.jobs.set(jobId, jobData);

    // Start the job asynchronously (don't await)
    this.executeJob(jobId).catch((error) => {
      logger.error(`Job ${jobId} failed`, error, {
        jobId,
        operation: "startEvaluationJob",
        experimentName,
        graphName: input.graphName,
        datasetName: input.datasetName,
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.updateJobStatus(jobId, EvaluationJobStatus.FAILED, {
        message: "Evaluation job failed",
        errorMessage: error.message,
      });
    });

    return {
      jobId,
      status: EvaluationJobStatus.QUEUED,
      experimentName,
      message: "Evaluation job queued and will start shortly",
      createdAt: now,
    };
  }

  /**
   * Get job status and details
   */
  getJobDetails(jobId: string): EvaluationJobDetails | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    return {
      jobId: job.jobId,
      status: job.status,
      experimentName: job.experimentName,
      experimentId: job.experimentId,
      message: job.message,
      url: job.url,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      progress: job.progress,
      processedExamples: job.processedExamples,
      totalExamples: job.totalExamples,
      errorMessage: job.errorMessage,
      results: job.results,
      usedPrompts: job.usedPrompts,
    };
  }

  /**
   * Execute the evaluation job using LangSmith's aevaluate
   */
  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    logger.info(`Starting job ${jobId}`, {
      jobId,
      operation: "executeJob",
      experimentName: job.experimentName,
      graphName: job.input.graphName,
      datasetName: job.input.datasetName,
      evaluatorCount: job.input.evaluators.length,
      maxConcurrency: job.input.maxConcurrency || 10,
      numRepetitions: job.input.numRepetitions || 1,
    });

    this.updateJobStatus(jobId, EvaluationJobStatus.RUNNING, {
      message: "Evaluation job is now running...",
      progress: 0,
    });

    try {
      const { LangSmithService } = await import("../langsmith/service.js");
      const langsmithService = new LangSmithService();

      // Use the same target function as the sync version but run it async
      const target = await this.createTargetFunction(
        job.input,
        job.context,
        langsmithService,
      );

      // Prepare evaluators, potentially fetching prompts from LangSmith
      const { createEvaluator } = await import("../evaluators/core/factory.js");
      const usedPrompts: Record<string, UsedPromptInfo> = {};

      const evaluatorPromises = job.input.evaluators.map(
        async (evaluatorInput) => {
          let promptToUse = evaluatorInput.customPrompt;

          // If langsmithPromptName is provided, fetch the prompt from LangSmith
          if (
            evaluatorInput.langsmithPromptName &&
            !evaluatorInput.customPrompt
          ) {
            try {
              const promptData = await langsmithService.pullPrompt(
                evaluatorInput.langsmithPromptName,
              );
              promptToUse = langsmithService.convertPromptToText(
                promptData.promptData,
              );
              usedPrompts[evaluatorInput.type] = {
                type: "langsmith",
                content: promptToUse,
                source: evaluatorInput.langsmithPromptName,
              };
            } catch (error) {
              logger.error(
                `Failed to fetch prompt ${evaluatorInput.langsmithPromptName}`,
                error,
                {
                  operation: "fetchPromptForJob",
                  jobId,
                  promptName: evaluatorInput.langsmithPromptName,
                  evaluatorType: evaluatorInput.type,
                  errorType:
                    error instanceof Error
                      ? error.constructor.name
                      : "UnknownError",
                },
              );
              throw new Error(
                `Failed to fetch LangSmith prompt "${evaluatorInput.langsmithPromptName}": ${error instanceof Error ? error.message : "Unknown error"}`,
              );
            }
          } else if (evaluatorInput.customPrompt) {
            usedPrompts[evaluatorInput.type] = {
              type: "custom",
              content: evaluatorInput.customPrompt,
            };
          } else {
            usedPrompts[evaluatorInput.type] = {
              type: "default",
              content: "(using built-in evaluator prompt)",
            };
          }

          return createEvaluator(
            evaluatorInput.type,
            promptToUse,
            evaluatorInput.model,
            evaluatorInput.referenceKey,
          );
        },
      );

      const evaluators = await Promise.all(evaluatorPromises);

      // Store the used prompts
      this.updateJobStatus(jobId, EvaluationJobStatus.RUNNING, {
        usedPrompts,
      });

      // Prepare evaluation config for concurrent execution
      const evaluationConfig = {
        evaluators,
        experimentPrefix:
          job.input.experimentPrefix || `eval-${job.input.graphName}`,
        maxConcurrency: job.input.maxConcurrency || 10, // Enable concurrent processing of examples
        numRepetitions: job.input.numRepetitions || 1, // Number of times to run each example
      };

      // Use LangSmith's evaluate function with concurrency
      const experimentResults: any = await evaluate(target as any, {
        data: job.input.datasetName,
        ...evaluationConfig,
      });

      // Transform results to match our schema
      const results = await this.transformExperimentResults(experimentResults);

      logger.info(`Job ${jobId} completed successfully`, {
        jobId,
        operation: "executeJob",
        experimentName: results.experimentName,
        experimentId: results.experimentId,
        resultCount: results.results?.length || 0,
        totalExamples: job.totalExamples,
        duration: Date.now() - new Date(job.createdAt).getTime(),
      });

      this.updateJobStatus(jobId, EvaluationJobStatus.COMPLETED, {
        message: "Evaluation completed successfully",
        progress: 100,
        results,
        experimentId: results.experimentId,
      });
    } catch (error) {
      logger.error(`Job ${jobId} failed`, error, {
        jobId,
        operation: "executeJob",
        experimentName: job.experimentName,
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
        duration: Date.now() - new Date(job.createdAt).getTime(),
      });
      this.updateJobStatus(jobId, EvaluationJobStatus.FAILED, {
        message: "Evaluation job failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Create the target function for evaluation (same as sync version)
   */
  private async createTargetFunction(
    input: RunEvaluationInput,
    context: GraphQLContext,
    langsmithService: any,
  ) {
    const { graphName, selectedCompanyId, preferredLanguage } = input;

    let selectedPreferredLanguage = preferredLanguage;
    if (!selectedPreferredLanguage) {
      selectedPreferredLanguage = context.user?.me.preferredLanguage;
    }

    const graphFactory = langsmithService.graphFactoryMap[graphName];
    if (!graphFactory) {
      throw new Error(`Graph factory not found for graph: ${graphName}`);
    }

    // Target function for evaluation
    return async (inputs: Record<string, any>) => {
      // Expect the 'question' key directly from the input
      const question = inputs.question;
      if (!question || typeof question !== "string") {
        throw new Error(
          `Input must contain a 'question' field with a string value. Available keys: ${Object.keys(inputs).join(", ")}`,
        );
      }

      // Check if this specific example has a preferredLanguage override
      const examplePreferredLanguage = inputs.preferredLanguage;

      const graphInput = {
        messages: [{ role: "user", content: question }],
        ...(examplePreferredLanguage && {
          preferredLanguage: examplePreferredLanguage,
        }), // Only include if provided
      };
      const graph = await graphFactory();

      // Extract bearer token (if provided)
      let token = context.token || "";
      if (token.toLowerCase().startsWith("bearer ")) {
        token = token.slice(7).trim();
      }

      // Create Rita thread just before invoking the graph
      const graphqlClient = createGraphQLClient(context.token || "");

      // Generate a unique LangGraph thread ID for this evaluation
      const lcThreadId = `eval-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const threadResult = await graphqlClient.createRitaThread({
        input: {
          title: `Evaluation - ${question.substring(0, 50)}...`,
          triggerType: RitaThreadTriggerType.Evaluation,
          hrCompanyId: selectedCompanyId,
          status: RitaThreadStatus.Received,
          lcThreadId,
        },
      });

      const ritaThread = threadResult.createRitaThread;
      logger.info(
        `🧵 RitaThread created: ${ritaThread.id} (lc: ${ritaThread.lcThreadId}) for question: "${question.substring(0, 50)}..."`,
        {
          threadId: ritaThread.id,
          lcThreadId: ritaThread.lcThreadId,
          operation: "createTargetFunction",
          graphName,
          selectedCompanyId,
          questionPreview: question.substring(0, 50),
          hasPreferredLanguage: !!examplePreferredLanguage,
        },
      );

      const config = {
        configurable: {
          thread_id: ritaThread.lcThreadId, // Use the LangGraph thread ID
          langgraph_auth_user: {
            token,
            user: {
              firstName: context.user?.me.firstName,
              lastName: context.user?.me.lastName,
              preferredLanguage: context.user?.me.preferredLanguage,
              company: {
                id: selectedCompanyId,
              },
            },
          },
        },
      };

      const result: any = await graph.invoke(graphInput, config);

      const lastMessage = Array.isArray(result?.messages)
        ? result.messages[result.messages.length - 1]
        : undefined;
      const answer = lastMessage?.content;

      if (typeof answer !== "string") {
        logger.warn(
          `[${ritaThread.id}] Graph did not return a final message with string content. Returning empty answer`,
          {
            threadId: ritaThread.id,
            operation: "createTargetFunction",
            graphName,
            messageType: typeof answer,
            hasResult: !!result,
            hasMessages: Array.isArray(result?.messages),
            messageCount: result?.messages?.length || 0,
          },
        );
        return {
          answer: "",
          dataChangeProposals: [],
        };
      }

      // Fetch data change proposals from the database after graph execution
      const threadItemsResult = await graphqlClient.getThreadItemsByThreadId({
        threadId: ritaThread.id,
      });

      const dataChangeProposals = [];
      if (threadItemsResult?.thread?.threadItems) {
        for (const item of threadItemsResult.thread.threadItems) {
          try {
            const data =
              typeof item.data === "string" ? JSON.parse(item.data) : item.data;
            if (data.type === "DATA_CHANGE_PROPOSAL" && data.proposal) {
              const proposal = {
                changedField: data.proposal.changedField,
                newValue: data.proposal.newValue,
                mutationQueryPropertyPath:
                  data.proposal.mutationQuery?.propertyPath,
                relatedUserId: data.proposal.relatedUserId,
                mutationVariables: data.proposal.mutationQuery?.variables,
              };
              dataChangeProposals.push(proposal);
            }
          } catch (e) {
            logger.error(`[${ritaThread.id}] Failed to parse thread item`, e, {
              threadId: ritaThread.id,
              operation: "parseThreadItems",
              itemId: item?.id,
              hasData: !!item?.data,
              dataType: typeof item?.data,
              errorType:
                e instanceof Error ? e.constructor.name : "UnknownError",
            });
          }
        }
      }

      if (dataChangeProposals.length > 0) {
        logger.info(
          `[${ritaThread.id}] Found ${dataChangeProposals.length} data change proposal(s)`,
          {
            threadId: ritaThread.id,
            lcThreadId: ritaThread.lcThreadId,
            operation: "extractDataChangeProposals",
            proposalCount: dataChangeProposals.length,
            graphName,
            hasThreadItems: !!threadItemsResult?.thread?.threadItems,
          },
        );
      }
      return {
        answer,
        dataChangeProposals,
      };
    };
  }

  /**
   * Transform LangSmith experiment results to our schema format with dynamic feedback stats
   */
  private async transformExperimentResults(
    experimentResults: any,
  ): Promise<EvaluationResult> {
    const results: any[] = [];

    // Handle different result formats from evaluate
    const resultItems = experimentResults.results ?? experimentResults ?? [];

    for (const item of resultItems) {
      const run = item.run;
      const evalResults = item.evaluationResults;
      if (!run) continue;

      // Transform scores to support dynamic evaluators
      const scores = (evalResults?.results ?? []).map((score: any) => ({
        key: score.key,
        score: String(score.score),
        comment: score.comment,
      }));

      const startTime = run.start_time ?? 0;
      const endTime = run.end_time ?? 0;
      const latency = endTime > 0 && startTime > 0 ? endTime - startTime : 0;
      const totalTokens = run.total_tokens ?? 0;

      results.push({
        id: run.id,
        inputs: JSON.stringify(run.inputs),
        outputs: run.outputs ? JSON.stringify(run.outputs) : null,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        latency,
        totalTokens,
        scores,
      });
    }

    // Build LangSmith experiment URL
    const manager = experimentResults?.manager;
    const client = manager?.client;
    const experiment = manager?._experiment;
    const experimentName = experiment?.name ?? "Unnamed Experiment";

    const webUrl = client?.webUrl;
    const tenantId = client?._tenantId;
    const datasetId = experiment?.reference_dataset_id;
    const experimentId = experiment?.id;

    let url = "";
    if (webUrl && tenantId && datasetId && experimentId) {
      url = `${webUrl}/o/${tenantId}/datasets/${datasetId}/compare?selectedSessions=${experimentId}`;
    }
    if (!url) {
      logger.warn(
        "Could not construct the full LangSmith results URL from the experiment object. Providing a fallback.",
        {
          operation: "transformExperimentResults",
          hasWebUrl: !!webUrl,
          hasTenantId: !!tenantId,
          hasDatasetId: !!datasetId,
          hasExperimentId: !!experimentId,
          experimentName,
        },
      );
      url = webUrl ? `${webUrl}/projects` : "URL not available";
    }

    return {
      url,
      experimentName,
      experimentId: experimentId || "unknown",
      results,
    };
  }

  /**
   * Update job status
   */
  private updateJobStatus(
    jobId: string,
    status: EvaluationJobStatus,
    updates: Partial<JobData> = {},
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.warn(`Attempted to update non-existent job ${jobId}`, {
        jobId,
        operation: "updateJobStatus",
        newStatus: status,
        existingJobIds: Array.from(this.jobs.keys()).slice(0, 5),
      });
      return;
    }

    const updatedJob = {
      ...job,
      status,
      updatedAt: new Date().toISOString(),
      ...updates,
    };

    this.jobs.set(jobId, updatedJob);
    logger.info(`Job ${jobId} status updated to ${status}`, {
      jobId,
      status,
      operation: "updateJobStatus",
      experimentName: updatedJob.experimentName,
      hasProgress: updates.progress !== undefined,
      progress: updates.progress,
      processedExamples: updates.processedExamples,
      totalExamples: updates.totalExamples,
    });
  }

  /**
   * Get a list of all jobs with their status
   */
  getAllJobs(): Array<{
    jobId: string;
    status: EvaluationJobStatus;
    experimentName: string;
    createdAt: string;
  }> {
    return Array.from(this.jobs.values()).map((job) => ({
      jobId: job.jobId,
      status: job.status,
      experimentName: job.experimentName,
      createdAt: job.createdAt,
    }));
  }

  /**
   * Cleanup completed jobs (call periodically)
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): void {
    // 24 hours default
    const now = Date.now();
    const cutoff = new Date(now - maxAge);
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      const jobAge = now - new Date(job.createdAt).getTime();
      if (
        jobAge > maxAge &&
        (job.status === EvaluationJobStatus.COMPLETED ||
          job.status === EvaluationJobStatus.FAILED)
      ) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old jobs`, {
        cleanedCount: cleaned,
        operation: "cleanup",
        remainingJobs: this.jobs.size,
        cutoffTime: cutoff.toISOString(),
      });
    }
  }
}
