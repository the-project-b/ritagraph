import {
  ApplicationError,
  Result,
  err,
  isOk,
  ok,
  unwrap,
  unwrapErr,
} from "@the-project-b/types";
import {
  DatasetRepository,
  EvaluationConfig,
  EvaluationService,
  Experiment,
  ExperimentId,
  ExperimentRepository,
  ExperimentStatus,
} from "../../domain/index.js";
import {
  RunEvaluationDto,
  RunEvaluationResult,
} from "../dto/run-evaluation.dto.js";
import { EvaluationOrchestratorService } from "../services/evaluation-orchestrator.service.js";
import {
  JobManagerService,
  JobStatus,
} from "../services/job-manager.service.js";

export interface RunEvaluationContext {
  authToken: string;
  userId: string;
  companyId: string;
}

/**
 * Use case for running evaluations
 */
export class RunEvaluationUseCase {
  constructor(
    private readonly datasetRepo: DatasetRepository,
    private readonly experimentRepo: ExperimentRepository,
    private readonly evaluationService: EvaluationService,
    private readonly jobManager: JobManagerService,
    private readonly orchestrator: EvaluationOrchestratorService,
  ) {}

  async execute(
    dto: RunEvaluationDto,
    context: RunEvaluationContext,
  ): Promise<Result<RunEvaluationResult, ApplicationError>> {
    try {
      // 1. Validate dataset exists
      const datasetResult = await this.datasetRepo.findByName(dto.datasetName);
      if (!isOk(datasetResult)) {
        return err(
          new ApplicationError(
            `Dataset "${dto.datasetName}" not found. Please verify the dataset name and try again.`,
          ),
        );
      }
      const dataset = unwrap(datasetResult);

      // 2. Count examples for validation
      const exampleCount = await this.datasetRepo.countExamples(
        dataset.id,
        dto.splits,
      );

      if (exampleCount === 0) {
        const message =
          dto.splits && dto.splits.length > 0
            ? `No examples found in dataset "${dto.datasetName}" for splits: [${dto.splits.join(", ")}]`
            : `Dataset "${dto.datasetName}" contains no examples`;
        return err(new ApplicationError(message));
      }

      // 3. Create evaluation config
      const config = new EvaluationConfig({
        experimentPrefix: dto.experimentPrefix,
        maxConcurrency: dto.maxConcurrency,
        numRepetitions: dto.numRepetitions,
        selectedCompanyId: dto.selectedCompanyId || context.companyId,
        preferredLanguage: dto.preferredLanguage,
      });

      // 4. Validate evaluation can be performed
      const validationResult = this.evaluationService.validateEvaluation(
        dataset,
        config,
        dto.evaluators,
      );

      if (!isOk(validationResult)) {
        return err(new ApplicationError(unwrapErr(validationResult).message));
      }

      // 5. Create experiment name
      const experimentName = this.evaluationService.createExperimentName(
        dto.datasetName,
        dto.experimentPrefix,
      );

      // 6. Create experiment entity
      const experimentId = new ExperimentId(this.generateId());
      const experimentResult = Experiment.create({
        id: experimentId,
        name: experimentName,
        datasetId: dataset.id,
        config,
        status: ExperimentStatus.PENDING,
        metadata: {
          graphName: dto.graphName,
          totalExamples: exampleCount,
          evaluators: dto.evaluators,
        },
      });

      if (!isOk(experimentResult)) {
        return err(new ApplicationError(unwrapErr(experimentResult).message));
      }
      const experiment = unwrap(experimentResult);

      // 7. Save experiment
      await this.experimentRepo.save(experiment);

      // 8. Create job for async execution
      const jobId = this.jobManager.createJob(
        {
          experiment,
          dataset,
          config,
          evaluators: dto.evaluators,
          graphName: dto.graphName,
          context,
        },
        { experimentId: experimentId.toString() },
      );

      // 9. Start async execution
      this.executeAsync(jobId, experiment, dataset, config, dto, context);

      // 10. Calculate URL
      const url = this.evaluationService.calculateExperimentUrl(
        experimentId.toString(),
      );

      return ok({
        jobId,
        status: "QUEUED",
        experimentName,
        experimentId: experimentId.toString(),
        message: `Evaluation job ${jobId} has been queued`,
        url,
        createdAt: new Date(),
      });
    } catch (error) {
      return err(
        new ApplicationError(
          `Failed to start evaluation: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  }

  private async executeAsync(
    jobId: string,
    experiment: Experiment,
    dataset: any,
    config: EvaluationConfig,
    dto: RunEvaluationDto,
    context: RunEvaluationContext,
  ): Promise<void> {
    try {
      // Update job status to running
      this.jobManager.updateJobStatus(jobId, JobStatus.RUNNING);

      // Update experiment status
      experiment.updateStatus(ExperimentStatus.RUNNING);
      await this.experimentRepo.update(experiment);

      // Execute evaluation through orchestrator
      const result = await this.orchestrator.orchestrateEvaluation({
        experiment,
        dataset,
        config,
        evaluators: dto.evaluators,
        graphName: dto.graphName,
        splits: dto.splits,
        authContext: {
          token: context.authToken,
          userId: context.userId,
          companyId: context.companyId,
        },
        onProgress: (processed, total) => {
          this.jobManager.updateJobProgress(jobId, processed, total);
        },
      });

      if (isOk(result)) {
        // Update experiment status
        experiment.updateStatus(ExperimentStatus.COMPLETED);
        await this.experimentRepo.update(experiment);

        // Update job with result
        this.jobManager.setJobResult(jobId, unwrap(result));
      } else {
        // Update experiment status
        experiment.updateStatus(ExperimentStatus.FAILED);
        await this.experimentRepo.update(experiment);

        // Update job status
        this.jobManager.updateJobStatus(
          jobId,
          JobStatus.FAILED,
          unwrapErr(result),
        );
      }
    } catch (error) {
      // Update experiment status
      experiment.updateStatus(ExperimentStatus.FAILED);
      await this.experimentRepo.update(experiment);

      // Update job status
      this.jobManager.updateJobStatus(
        jobId,
        JobStatus.FAILED,
        error instanceof Error ? error : new Error("Unknown error"),
      );
    }
  }

  private generateId(): string {
    return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
