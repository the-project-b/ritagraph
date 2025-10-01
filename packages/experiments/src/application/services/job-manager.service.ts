import { ApplicationError, Result, err, ok } from "@the-project-b/types";
import { v4 as uuidv4 } from "uuid";

export enum JobStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export interface JobData<T = unknown, R = unknown> {
  id: string;
  status: JobStatus;
  input: T;
  result?: R;
  error?: Error;
  progress?: number;
  processedItems?: number;
  totalItems?: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Generic job manager for handling async operations
 */
export class JobManagerService<T = any, R = any> {
  private jobs: Map<string, JobData<T, R>> = new Map();

  /**
   * Create a new job
   */
  createJob(input: T, metadata?: Record<string, any>): string {
    const jobId = uuidv4();
    const now = new Date();

    const job: JobData<T, R> = {
      id: jobId,
      status: JobStatus.QUEUED,
      input,
      createdAt: now,
      updatedAt: now,
      metadata,
    };

    this.jobs.set(jobId, job);
    return jobId;
  }

  /**
   * Get job details
   */
  getJob(jobId: string): Result<JobData<T, R>, ApplicationError> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return err(new ApplicationError(`Job ${jobId} not found`));
    }
    return ok(job);
  }

  /**
   * Update job status
   */
  updateJobStatus(
    jobId: string,
    status: JobStatus,
    error?: Error,
  ): Result<void, ApplicationError> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return err(new ApplicationError(`Job ${jobId} not found`));
    }

    job.status = status;
    job.updatedAt = new Date();
    if (error) {
      job.error = error;
    }

    return ok(undefined);
  }

  /**
   * Update job progress
   */
  updateJobProgress(
    jobId: string,
    processedItems: number,
    totalItems: number,
  ): Result<void, ApplicationError> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return err(new ApplicationError(`Job ${jobId} not found`));
    }

    job.processedItems = processedItems;
    job.totalItems = totalItems;
    job.progress = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
    job.updatedAt = new Date();

    return ok(undefined);
  }

  /**
   * Set job result
   */
  setJobResult(jobId: string, result: R): Result<void, ApplicationError> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return err(new ApplicationError(`Job ${jobId} not found`));
    }

    job.result = result;
    job.status = JobStatus.COMPLETED;
    job.updatedAt = new Date();

    return ok(undefined);
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): Result<void, ApplicationError> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return err(new ApplicationError(`Job ${jobId} not found`));
    }

    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
      return err(
        new ApplicationError(`Cannot cancel job in ${job.status} state`),
      );
    }

    job.status = JobStatus.CANCELLED;
    job.updatedAt = new Date();

    return ok(undefined);
  }

  /**
   * List all jobs
   */
  listJobs(filter?: {
    status?: JobStatus;
    createdAfter?: Date;
    createdBefore?: Date;
  }): JobData<T, R>[] {
    let jobs = Array.from(this.jobs.values());

    if (filter) {
      if (filter.status) {
        jobs = jobs.filter((j) => j.status === filter.status);
      }
      if (filter.createdAfter) {
        jobs = jobs.filter((j) => j.createdAt >= filter.createdAfter!);
      }
      if (filter.createdBefore) {
        jobs = jobs.filter((j) => j.createdAt <= filter.createdBefore!);
      }
    }

    return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Clean up old completed/failed jobs
   */
  cleanupJobs(olderThan: Date): number {
    const jobsToDelete: string[] = [];

    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === JobStatus.COMPLETED ||
          job.status === JobStatus.FAILED ||
          job.status === JobStatus.CANCELLED) &&
        job.updatedAt < olderThan
      ) {
        jobsToDelete.push(jobId);
      }
    }

    for (const jobId of jobsToDelete) {
      this.jobs.delete(jobId);
    }

    return jobsToDelete.length;
  }
}
