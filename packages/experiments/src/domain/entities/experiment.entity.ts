import { Result, ValidationError, err, ok } from "@the-project-b/types";
import { DatasetId } from "../value-objects/dataset-id.value-object.js";
import { EvaluationConfig } from "../value-objects/evaluation-config.value-object.js";
import { ExperimentId } from "../value-objects/experiment-id.value-object.js";
import { EvaluationRun } from "./evaluation-run.entity.js";

export enum ExperimentStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export interface ExperimentStatistics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageLatency?: number;
  totalTokens?: number;
  totalCost?: number;
  errorRate: number;
  feedbackStats?: Record<string, any>;
}

/**
 * Experiment entity - represents a collection of evaluation runs
 */
export class Experiment {
  private constructor(
    public readonly id: ExperimentId,
    public readonly name: string,
    public readonly datasetId: DatasetId,
    private _runs: EvaluationRun[],
    public readonly config: EvaluationConfig,
    public readonly status: ExperimentStatus,
    public readonly description?: string,
    public readonly startTime: Date = new Date(),
    public readonly endTime?: Date,
    public readonly metadata?: Record<string, any>,
    public readonly url?: string,
  ) {}

  static create(props: {
    id: string | ExperimentId;
    name: string;
    datasetId: string | DatasetId;
    runs?: EvaluationRun[];
    config: EvaluationConfig;
    status?: ExperimentStatus;
    description?: string;
    startTime?: Date;
    endTime?: Date;
    metadata?: Record<string, any>;
    url?: string;
  }): Result<Experiment, ValidationError> {
    if (!props.name) {
      return err(new ValidationError("Experiment name is required"));
    }

    const id =
      typeof props.id === "string" ? new ExperimentId(props.id) : props.id;

    const datasetId =
      typeof props.datasetId === "string"
        ? new DatasetId(props.datasetId)
        : props.datasetId;

    return ok(
      new Experiment(
        id,
        props.name,
        datasetId,
        props.runs || [],
        props.config,
        props.status || ExperimentStatus.PENDING,
        props.description,
        props.startTime || new Date(),
        props.endTime,
        props.metadata,
        props.url,
      ),
    );
  }

  get runs(): readonly EvaluationRun[] {
    return this._runs;
  }

  addRun(run: EvaluationRun): Result<void, ValidationError> {
    if (run.experimentId !== this.id.toString()) {
      return err(new ValidationError("Run does not belong to this experiment"));
    }
    const existing = this._runs.find((r) => r.id === run.id);
    if (existing) {
      return err(new ValidationError(`Run with ID ${run.id} already exists`));
    }
    this._runs.push(run);
    return ok(undefined);
  }

  calculateStatistics(): ExperimentStatistics {
    const totalRuns = this._runs.length;
    const successfulRuns = this._runs.filter((r) => r.isSuccess()).length;
    const failedRuns = this._runs.filter((r) => r.isFailure()).length;

    const latencies = this._runs
      .map((r) => r.getLatency())
      .filter((l): l is number => l !== undefined);

    const averageLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : undefined;

    const totalTokens = this._runs.reduce(
      (sum, r) => sum + (r.metrics?.totalTokens || 0),
      0,
    );

    const totalCost = this._runs.reduce(
      (sum, r) => sum + (r.metrics?.totalCost || 0),
      0,
    );

    const errorRate = totalRuns > 0 ? failedRuns / totalRuns : 0;

    // Aggregate feedback scores
    const feedbackStats: Record<string, any> = {};
    const feedbackKeys = new Set<string>();

    this._runs.forEach((run) => {
      run.feedbackScores.forEach((score) => {
        feedbackKeys.add(score.key);
      });
    });

    feedbackKeys.forEach((key) => {
      const scores = this._runs
        .map((r) => r.getFeedbackScore(key))
        .filter((s): s is any => s !== undefined && s.score !== undefined)
        .map((s) => s.score!);

      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance =
          scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) /
          scores.length;
        const stdev = Math.sqrt(variance);

        feedbackStats[key] = {
          n: scores.length,
          avg,
          stdev,
          min: Math.min(...scores),
          max: Math.max(...scores),
        };
      }
    });

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      averageLatency,
      totalTokens,
      totalCost,
      errorRate,
      feedbackStats,
    };
  }

  isComplete(): boolean {
    return this.status === ExperimentStatus.COMPLETED;
  }

  isRunning(): boolean {
    return this.status === ExperimentStatus.RUNNING;
  }

  isFailed(): boolean {
    return this.status === ExperimentStatus.FAILED;
  }

  updateStatus(status: ExperimentStatus): void {
    (this as any).status = status;
    if (
      status === ExperimentStatus.COMPLETED ||
      status === ExperimentStatus.FAILED ||
      status === ExperimentStatus.CANCELLED
    ) {
      (this as any).endTime = new Date();
    }
  }

  getProgress(): number {
    const totalExpected =
      this.config.numRepetitions * (this.metadata?.totalExamples || 0);
    if (totalExpected === 0) return 0;
    return (this._runs.length / totalExpected) * 100;
  }
}
