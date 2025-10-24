import { createLogger, normalizeError } from "@the-project-b/logging";
import { isErr } from "@the-project-b/types";
import {
  TextractClient,
  ExtractionResultDto,
} from "@the-project-b/file-extraction";
import { getThreadIdFromConfig } from "../../../utils/config-helper.js";
import type { Node, FailedAttachment, CostMetrics } from "../graph-state.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "FileExtraction",
  node: "retrieveResults",
});

export const retrieveResults: Node = async (state, config) => {
  const threadId = getThreadIdFromConfig(config);

  logger.info("Retrieving extraction results", {
    operation: "retrieveResults",
    threadId,
    jobCount: state.extractionJobs.length,
  });

  const region = process.env.AWS_REGION || "eu-central-1";
  const adapter = ExtractionAdapterFactory.create({
    type: "textract",
    region,
  });

  const extractionResults: ExtractionResultDto[] = [];
  const failedAttachments: FailedAttachment[] = [...state.failedAttachments];

  for (const job of state.extractionJobs) {
    if (job.status === "FAILED") {
      logger.warn("Skipping failed job", {
        jobId: job.jobId,
        attachmentId: job.attachmentId,
        filename: job.filename,
        threadId,
      });
      failedAttachments.push({
        attachmentId: job.attachmentId,
        filename: job.filename,
        error: "Textract job failed",
      });
      continue;
    }

    if (job.status !== "SUCCEEDED") {
      logger.warn("Skipping incomplete job", {
        jobId: job.jobId,
        attachmentId: job.attachmentId,
        status: job.status,
        threadId,
      });
      failedAttachments.push({
        attachmentId: job.attachmentId,
        filename: job.filename,
        error: `Job incomplete - status: ${job.status}`,
      });
      continue;
    }

    try {
      const resultData = await adapter.getExtractionJobResult(job.jobId);

      if (isErr(resultData)) {
        logger.error("Failed to retrieve extraction result", resultData.error, {
          jobId: job.jobId,
          attachmentId: job.attachmentId,
          filename: job.filename,
          threadId,
        });
        failedAttachments.push({
          attachmentId: job.attachmentId,
          filename: job.filename,
          error: resultData.error.message,
        });
        continue;
      }

      const result = resultData.value;

      logger.info("Extraction result retrieved", {
        attachmentId: job.attachmentId,
        filename: job.filename,
        textLength: result.extractedText.length,
        confidence: result.metadata.confidence,
        pageCount: result.metadata.pageCount,
        cost: result.cost.estimatedCostUSD,
        threadId,
      });

      extractionResults.push(result);
    } catch (error) {
      const { message } = normalizeError(error);
      logger.error("Unexpected error retrieving result", error as Error, {
        jobId: job.jobId,
        attachmentId: job.attachmentId,
        threadId,
      });
      failedAttachments.push({
        attachmentId: job.attachmentId,
        filename: job.filename,
        error: message,
      });
    }
  }

  const totalCost: CostMetrics = extractionResults.reduce(
    (acc, result) => ({
      pages: acc.pages + result.cost.pages,
      apiCalls: acc.apiCalls + result.cost.apiCalls,
      estimatedCostUSD: acc.estimatedCostUSD + result.cost.estimatedCostUSD,
    }),
    { pages: 0, apiCalls: 0, estimatedCostUSD: 0 },
  );

  logger.info("Results retrieval complete", {
    threadId,
    successCount: extractionResults.length,
    failureCount: failedAttachments.length,
    totalCost: totalCost.estimatedCostUSD,
  });

  return {
    extractionResults,
    failedAttachments,
    totalCost,
  };
};
