export interface ExperimentResultDto {
  id: string;
  name: string;
  datasetId: string;
  startTime: Date;
  endTime?: Date;
  description?: string;
  runCount: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
  promptCost?: number;
  completionCost?: number;
  errorRate?: number;
  latencyP50?: number;
  latencyP99?: number;
  feedbackStats?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  url?: string;
}

export interface ExperimentDetailsDto {
  experiment: ExperimentResultDto;
  runs: RunResultDto[];
  totalRuns: number;
}

export interface RunResultDto {
  id: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  latency?: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  inputsPreview?: string;
  outputsPreview?: string;
  error?: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
  promptCost?: number;
  completionCost?: number;
  feedbackStats?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
}
