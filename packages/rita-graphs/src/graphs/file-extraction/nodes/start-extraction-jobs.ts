import { createLogger, normalizeError } from "@the-project-b/logging";
import { isErr } from "@the-project-b/types";
import {
  ExtractionAdapterFactory,
  GraphQLAttachmentRepository,
  Document,
  DocumentType,
  AttachmentId,
  ExtractionConfig,
} from "@the-project-b/file-extraction";
import { getThreadIdFromConfig } from "../../../utils/config-helper.js";
import type { Node, ExtractionJob, FailedAttachment } from "../graph-state.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "FileExtraction",
  node: "startExtractionJobs",
});

export const startExtractionJobs: Node = async (state, config, getAuthUser) => {
  const { token } = getAuthUser(config);
  const threadId = getThreadIdFromConfig(config);

  logger.info("Starting extraction jobs", {
    operation: "startExtractionJobs",
    threadId,
    attachmentCount: state.attachmentIds?.length || 0,
    companyId: state.selectedCompanyId,
  });

  if (!state.attachmentIds || state.attachmentIds.length === 0) {
    logger.warn("No attachments to process", { threadId });
    return null;
  }

  const graphqlEndpoint = process.env.PROJECTB_GRAPHQL_ENDPOINT || "";
  const attachmentRepo = new GraphQLAttachmentRepository(
    graphqlEndpoint,
    token,
  );

  const region = process.env.AWS_REGION || "eu-central-1";

  const adapter = ExtractionAdapterFactory.create({
    type: "textract",
    region,
  });

  const extractionJobs: ExtractionJob[] = [];
  const failedAttachments: FailedAttachment[] = [];

  for (const attachmentId of state.attachmentIds) {
    try {
      logger.debug("Fetching attachment metadata", {
        attachmentId,
        threadId,
      });

      const attachmentIdResult = AttachmentId.create(attachmentId);
      if (isErr(attachmentIdResult)) {
        failedAttachments.push({
          attachmentId,
          filename: "unknown",
          error: `Invalid attachment ID: ${attachmentIdResult.error.message}`,
        });
        continue;
      }

      const attachmentResult = await attachmentRepo.findById(
        attachmentIdResult.value,
      );
      if (isErr(attachmentResult)) {
        logger.warn("Attachment not found", { attachmentId, threadId });
        failedAttachments.push({
          attachmentId,
          filename: "unknown",
          error: attachmentResult.error.message,
        });
        continue;
      }

      const attachment = attachmentResult.value;
      const filename = attachment.filename;

      const documentTypeResult = DocumentType.fromFilename(filename);
      if (isErr(documentTypeResult)) {
        failedAttachments.push({
          attachmentId,
          filename,
          error: `Unsupported file type: ${documentTypeResult.error.message}`,
        });
        continue;
      }

      const documentResult = Document.create({
        id: attachment.id,
        filename,
        type: documentTypeResult.value,
        sizeBytes: attachment.fileSize,
        s3Path: attachment.s3Path,
        s3Bucket: attachment.s3Bucket,
      });

      if (isErr(documentResult)) {
        failedAttachments.push({
          attachmentId,
          filename,
          error: `Invalid document: ${documentResult.error.message}`,
        });
        continue;
      }

      const document = documentResult.value;

      if (document.isArchive()) {
        logger.warn("Archive extraction not yet supported", {
          attachmentId,
          filename,
        });
        failedAttachments.push({
          attachmentId,
          filename,
          error: "Archive extraction not yet supported",
        });
        continue;
      }

      const extractionConfigResult = ExtractionConfig.create({});
      if (isErr(extractionConfigResult)) {
        failedAttachments.push({
          attachmentId,
          filename,
          error: `Invalid config: ${extractionConfigResult.error.message}`,
        });
        continue;
      }

      const jobResult = await adapter.startExtractionJob(
        document,
        extractionConfigResult.value,
      );

      if (isErr(jobResult)) {
        logger.error("Failed to start extraction job", jobResult.error, {
          attachmentId,
          filename,
        });
        failedAttachments.push({
          attachmentId,
          filename,
          error: jobResult.error.message,
        });
        continue;
      }

      const jobId = jobResult.value;

      logger.info("Extraction job started successfully", {
        attachmentId,
        jobId,
        filename,
        threadId,
      });

      extractionJobs.push({
        attachmentId,
        jobId,
        status: "STARTED",
        filename,
        s3Bucket: document.getS3Bucket(),
        s3Path: document.getS3Path(),
        fileSize: document.getSizeBytes(),
        startTime: Date.now(),
      });
    } catch (error) {
      const { message } = normalizeError(error);
      logger.error("Unexpected error processing attachment", error as Error, {
        attachmentId,
        threadId,
      });
      failedAttachments.push({
        attachmentId,
        filename: "unknown",
        error: message,
      });
    }
  }

  logger.info("Extraction jobs initialization complete", {
    threadId,
    totalAttachments: state.attachmentIds.length,
    jobsStarted: extractionJobs.length,
    failed: failedAttachments.length,
  });

  return {
    extractionJobs,
    failedAttachments,
  };
};
