import { Result, ValidationError, err, ok } from "@the-project-b/types";

export interface RunMetrics {
  latency?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
  promptCost?: number;
  completionCost?: number;
}

export interface FeedbackScore {
  key: string;
  score?: number;
  value?: any;
  comment?: string;
  correction?: string;
}

/**
 * Evaluation run entity - represents a single execution of an example
 */
export class EvaluationRun {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly exampleId: string,
    public readonly experimentId: string,
    public readonly inputs: Record<string, any>,
    public readonly outputs?: Record<string, any>,
    public readonly error?: string,
    public readonly startTime: Date = new Date(),
    public readonly endTime?: Date,
    public readonly metrics?: RunMetrics,
    public readonly feedbackScores: FeedbackScore[] = [],
    public readonly metadata?: Record<string, any>,
    public readonly tags?: string[],
  ) {}

  static create(props: {
    id: string;
    name: string;
    exampleId: string;
    experimentId: string;
    inputs: Record<string, any>;
    outputs?: Record<string, any>;
    error?: string;
    startTime?: Date;
    endTime?: Date;
    metrics?: RunMetrics;
    feedbackScores?: FeedbackScore[];
    metadata?: Record<string, any>;
    tags?: string[];
  }): Result<EvaluationRun, ValidationError> {
    if (!props.id) {
      return err(new ValidationError("Run ID is required"));
    }
    if (!props.exampleId) {
      return err(new ValidationError("Example ID is required"));
    }
    if (!props.experimentId) {
      return err(new ValidationError("Experiment ID is required"));
    }
    if (!props.inputs || Object.keys(props.inputs).length === 0) {
      return err(new ValidationError("Run inputs cannot be empty"));
    }

    return ok(
      new EvaluationRun(
        props.id,
        props.name,
        props.exampleId,
        props.experimentId,
        props.inputs,
        props.outputs,
        props.error,
        props.startTime || new Date(),
        props.endTime,
        props.metrics,
        props.feedbackScores || [],
        props.metadata,
        props.tags,
      ),
    );
  }

  isSuccess(): boolean {
    return !this.error && this.outputs !== undefined;
  }

  isFailure(): boolean {
    return !!this.error;
  }

  getLatency(): number | undefined {
    if (this.metrics?.latency) {
      return this.metrics.latency;
    }
    if (this.startTime && this.endTime) {
      return this.endTime.getTime() - this.startTime.getTime();
    }
    return undefined;
  }

  addFeedback(feedback: FeedbackScore): void {
    this.feedbackScores.push(feedback);
  }

  getFeedbackScore(key: string): FeedbackScore | undefined {
    return this.feedbackScores.find((f) => f.key === key);
  }

  getAverageFeedbackScore(key: string): number | undefined {
    const scores = this.feedbackScores
      .filter((f) => f.key === key && f.score !== undefined)
      .map((f) => f.score!);

    if (scores.length === 0) return undefined;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  hasTag(tag: string): boolean {
    return this.tags?.includes(tag) || false;
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      exampleId: this.exampleId,
      experimentId: this.experimentId,
      inputs: this.inputs,
      outputs: this.outputs,
      error: this.error,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime?.toISOString(),
      metrics: this.metrics,
      feedbackScores: this.feedbackScores,
      metadata: this.metadata,
      tags: this.tags,
    };
  }
}
