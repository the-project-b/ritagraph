import { createLogger, normalizeError } from "@the-project-b/logging";
import { isErr } from "@the-project-b/types";
import { ExtractionAdapterFactory } from "@the-project-b/file-extraction";
import { getThreadIdFromConfig } from "../../../utils/config-helper.js";
import type { Node, ExtractionJob } from "../graph-state.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "FileExtraction",
  node: "pollJobStatuses",
});

const POLL_DELAY_MS = 2000;

export const pollJobStatuses: Node = async (state, config) => {
  const threadId = getThreadIdFromConfig(config);

  logger.info("Polling extraction job statuses", {
    operation: "pollJobStatuses",
    threadId,
    jobCount: state.extractionJobs.length,
  });

  const region = process.env.AWS_REGION || "eu-central-1";
  const adapter = ExtractionAdapterFactory.create({
    type: "textract",
    region,
  });

  const updatedJobs: ExtractionJob[] = [];

  for (const job of state.extractionJobs) {
    if (job.status === "SUCCEEDED" || job.status === "FAILED") {
      updatedJobs.push(job);
      continue;
    }

    try {
      const statusResult = await adapter.getExtractionJobStatus(job.jobId);

      if (isErr(statusResult)) {
        logger.error("Failed to get job status", statusResult.error, {
          jobId: job.jobId,
          attachmentId: job.attachmentId,
          threadId,
        });
        updatedJobs.push({
          ...job,
          status: "FAILED",
        });
        continue;
      }

      const status = statusResult.value;

      logger.debug("Job status checked", {
        jobId: job.jobId,
        attachmentId: job.attachmentId,
        filename: job.filename,
        status,
        threadId,
      });

      updatedJobs.push({
        ...job,
        status,
      });
    } catch (error) {
      const { message } = normalizeError(error);
      logger.error("Unexpected error checking job status", error as Error, {
        jobId: job.jobId,
        attachmentId: job.attachmentId,
        threadId,
        message,
      });
      updatedJobs.push({
        ...job,
        status: "FAILED",
      });
    }
  }

  const completedCount = updatedJobs.filter(
    (j) => j.status === "SUCCEEDED" || j.status === "FAILED",
  ).length;
  const inProgressCount = updatedJobs.filter(
    (j) => j.status === "IN_PROGRESS" || j.status === "STARTED",
  ).length;

  logger.info("Job status poll complete", {
    threadId,
    totalJobs: updatedJobs.length,
    completed: completedCount,
    inProgress: inProgressCount,
  });

  if (inProgressCount > 0) {
    logger.debug("Waiting before next poll", {
      delayMs: POLL_DELAY_MS,
      threadId,
    });
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }

  return {
    extractionJobs: updatedJobs,
  };
};
