import { createLogger } from "@the-project-b/logging";
import { randomUUID } from "crypto";
import type { GraphQLContext } from "../types/context.js";
import {
  AsyncEvaluationResult,
  EvaluationJobDetails,
  EvaluationJobStatus,
  RunEvaluationInput,
} from "../types/index.js";
import { ExperimentsService } from "./experiments.service.js";

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
  input: RunEvaluationInput;
  context: GraphQLContext;
}

/**
 * Manages asynchronous evaluation jobs using the DDD experiments package
 */
export class EvaluationJobManager {
  private static instance: EvaluationJobManager;
  private jobs: Map<string, JobData> = new Map();
  private experimentsService: ExperimentsService;

  private constructor() {
    this.experimentsService = new ExperimentsService();
  }

  public static getInstance(): EvaluationJobManager {
    if (!EvaluationJobManager.instance) {
      EvaluationJobManager.instance = new EvaluationJobManager();
    }
    return EvaluationJobManager.instance;
  }

  /**
   * Start a new evaluation job
   */
  public async startEvaluationJob(
    input: RunEvaluationInput,
    context: GraphQLContext,
  ): Promise<AsyncEvaluationResult> {
    const jobId = randomUUID();
    const experimentName = this.generateExperimentName(input);

    // 1. VALIDATION: Does the target dataset exist?
    const datasetExists = await this.experimentsService.datasetExists(
      input.datasetName,
    );

    if (!datasetExists) {
      const errorMessage = `Dataset "${input.datasetName}" does not exist. Please verify the dataset name and try again.`;
      logger.error(errorMessage, {
        operation: "startEvaluationJob",
        datasetName: input.datasetName,
        graphName: input.graphName,
      });
      throw new Error(errorMessage);
    }

    // 2. VALIDATION: Are there any actual examples in the target split?
    const splits = input.splits || [];
    const exampleCount = await this.experimentsService.countExamples(
      input.datasetName,
      splits.length > 0 ? splits : undefined,
    );

    if (exampleCount === 0) {
      const errorMessage =
        splits.length > 0
          ? `No examples found in dataset "${input.datasetName}" for splits: [${splits.join(", ")}]. Available splits might be different. Please verify the split names or add examples to these splits.`
          : `Dataset "${input.datasetName}" exists but contains no examples. Please add examples to the dataset before running evaluations.`;

      logger.error(errorMessage, {
        operation: "startEvaluationJob.validateExamples",
        datasetName: input.datasetName,
        graphName: input.graphName,
        splits,
        exampleCount,
      });
      throw new Error(errorMessage);
    }

    logger.info(`Dataset validation successful`, {
      operation: "startEvaluationJob.validateDataset",
      datasetName: input.datasetName,
      splits,
      exampleCount,
      graphName: input.graphName,
    });

    // Create job data
    const jobData: JobData = {
      jobId,
      status: EvaluationJobStatus.QUEUED,
      experimentName,
      message: "Evaluation job queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalExamples: exampleCount,
      input,
      context,
    };

    this.jobs.set(jobId, jobData);

    // Start the evaluation asynchronously
    this.runEvaluationAsync(jobId);

    logger.info(`Evaluation job started`, {
      operation: "startEvaluationJob",
      jobId,
      experimentName,
      datasetName: input.datasetName,
      graphName: input.graphName,
      splits,
      evaluatorCount: input.evaluators?.length || 0,
    });

    return {
      jobId,
      status: EvaluationJobStatus.QUEUED,
      experimentName,
      message: "Evaluation job has been queued and will start shortly",
      createdAt: jobData.createdAt,
    };
  }

  /**
   * Run the evaluation asynchronously
   */
  private async runEvaluationAsync(jobId: string): Promise<void> {
    const jobData = this.jobs.get(jobId);
    if (!jobData) {
      logger.error("Job not found", { jobId });
      return;
    }

    try {
      // Update job status to running
      jobData.status = EvaluationJobStatus.RUNNING;
      jobData.message = "Evaluation is running";
      jobData.updatedAt = new Date().toISOString();

      logger.info(`Starting evaluation`, {
        operation: "runEvaluationAsync.start",
        jobId,
        experimentName: jobData.experimentName,
      });

      // Run the evaluation using the experiments service
      const result = await this.experimentsService.runEvaluation(
        jobData.input,
        jobData.context,
      );

      // Update job with success
      jobData.status = EvaluationJobStatus.COMPLETED;
      jobData.message = `Evaluation completed successfully`;
      jobData.experimentId = result.experimentId;
      jobData.url = result.url;
      jobData.updatedAt = new Date().toISOString();
      jobData.progress = 100;

      logger.info(`Evaluation completed successfully`, {
        operation: "runEvaluationAsync.complete",
        jobId,
        experimentName: jobData.experimentName,
        experimentId: result.experimentId,
      });
    } catch (error) {
      // Update job with failure
      jobData.status = EvaluationJobStatus.FAILED;
      jobData.message = "Evaluation failed";
      jobData.errorMessage =
        error instanceof Error ? error.message : String(error);
      jobData.updatedAt = new Date().toISOString();

      logger.error(`Evaluation failed`, {
        operation: "runEvaluationAsync.error",
        jobId,
        experimentName: jobData.experimentName,
        error: jobData.errorMessage,
      });
    }
  }

  /**
   * Get details of a specific job
   */
  public getJobDetails(jobId: string): EvaluationJobDetails | null {
    const jobData = this.jobs.get(jobId);
    if (!jobData) {
      return null;
    }

    return {
      jobId: jobData.jobId,
      status: jobData.status,
      experimentName: jobData.experimentName,
      experimentId: jobData.experimentId,
      message: jobData.message,
      url: jobData.url,
      createdAt: jobData.createdAt,
      updatedAt: jobData.updatedAt,
      progress: jobData.progress,
      processedExamples: jobData.processedExamples,
      totalExamples: jobData.totalExamples,
      errorMessage: jobData.errorMessage,
    };
  }

  /**
   * Get all jobs
   */
  public getAllJobs(): EvaluationJobDetails[] {
    return Array.from(this.jobs.values()).map((jobData) => ({
      jobId: jobData.jobId,
      status: jobData.status,
      experimentName: jobData.experimentName,
      experimentId: jobData.experimentId,
      message: jobData.message,
      url: jobData.url,
      createdAt: jobData.createdAt,
      updatedAt: jobData.updatedAt,
      progress: jobData.progress,
      processedExamples: jobData.processedExamples,
      totalExamples: jobData.totalExamples,
      errorMessage: jobData.errorMessage,
    }));
  }

  /**
   * Clear completed jobs (cleanup)
   */
  public clearCompletedJobs(): void {
    const completedJobs = Array.from(this.jobs.entries())
      .filter(
        ([_, job]) =>
          job.status === EvaluationJobStatus.COMPLETED ||
          job.status === EvaluationJobStatus.FAILED,
      )
      .map(([id]) => id);

    completedJobs.forEach((id) => this.jobs.delete(id));

    logger.info(`Cleared ${completedJobs.length} completed jobs`, {
      operation: "clearCompletedJobs",
    });
  }

  /**
   * Generate experiment name based on input
   */
  private generateExperimentName(input: RunEvaluationInput): string {
    const prefix = input.experimentPrefix || "experiment";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${prefix}-${timestamp}`;
  }
}
