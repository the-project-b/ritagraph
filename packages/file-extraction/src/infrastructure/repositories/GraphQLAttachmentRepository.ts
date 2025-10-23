import { Result, ok, err, isOk, NotFoundError } from "@the-project-b/types";
import { GraphQLClient } from "graphql-request";
import { createLogger, normalizeError } from "@the-project-b/logging";
import { getSdk } from "../../generated/graphql.js";
import type {
  AttachmentRepository,
  Attachment,
} from "../../domain/repositories/AttachmentRepository.js";
import { AttachmentId } from "../../domain/value-objects/AttachmentId.value-object.js";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "GraphQLAttachmentRepository",
});

/**
 * GraphQL-based implementation of AttachmentRepository.
 * Fetches attachment metadata from the backend GraphQL API.
 */
export class GraphQLAttachmentRepository implements AttachmentRepository {
  private sdk: ReturnType<typeof getSdk>;

  constructor(
    private readonly graphqlEndpoint: string,
    private readonly authToken: string,
  ) {
    const client = new GraphQLClient(graphqlEndpoint, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    this.sdk = getSdk(client);
  }

  async findById(id: AttachmentId): Promise<Result<Attachment, NotFoundError>> {
    try {
      logger.debug("Fetching attachment", { attachmentId: id.toString() });

      const response = await this.sdk.GetAttachment({
        data: { attachmentId: id.toString() },
      });

      if (!response.getAttachment) {
        logger.warn("Attachment not found", { attachmentId: id.toString() });
        return err(new NotFoundError("Attachment", id.toString()));
      }

      const attachment = this.mapToAttachment(response.getAttachment);
      logger.debug("Attachment fetched successfully", {
        attachmentId: id.toString(),
        fileName: attachment.filename,
      });

      return ok(attachment);
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);

      logger.error("Failed to fetch attachment", normalizedError, {
        attachmentId: id.toString(),
      });
      return err(
        new NotFoundError("Attachment", id.toString(), {
          error: message,
        }),
      );
    }
  }

  async findByIds(
    ids: AttachmentId[],
  ): Promise<Result<Attachment[], NotFoundError>> {
    try {
      logger.debug("Fetching multiple attachments", { count: ids.length });

      const results = await Promise.all(ids.map((id) => this.findById(id)));

      const attachments: Attachment[] = [];
      const errors: string[] = [];

      for (const result of results) {
        if (result.kind === "ok") {
          attachments.push(result.value);
        } else {
          errors.push(result.error.message);
        }
      }

      if (attachments.length === 0) {
        logger.warn("No attachments found", { requestedCount: ids.length });
        return err(
          new NotFoundError("Attachments", undefined, {
            requestedCount: ids.length,
          }),
        );
      }

      if (errors.length > 0) {
        logger.warn("Some attachments not found", {
          successCount: attachments.length,
          failureCount: errors.length,
        });
      }

      logger.debug("Attachments fetched successfully", {
        successCount: attachments.length,
        failureCount: errors.length,
      });

      return ok(attachments);
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);

      logger.error("Failed to fetch attachments", normalizedError);
      return err(
        new NotFoundError("Attachments", undefined, {
          error: message,
        }),
      );
    }
  }

  private mapToAttachment(
    data: NonNullable<
      Awaited<ReturnType<typeof this.sdk.GetAttachment>>["getAttachment"]
    >,
  ): Attachment {
    const idResult = AttachmentId.create(data.id);

    if (!isOk(idResult)) {
      throw new Error(`Invalid attachment ID: ${data.id}`);
    }

    return {
      id: idResult.value,
      ritaThreadItemId: data.ritaThreadItemId?.toString() ?? "",
      filename: data.fileName ?? "unknown",
      fileSize: data.fileSize,
      s3Path: data.filePathS3 ?? "",
      s3Bucket: data.fileS3Bucket ?? "",
      mimeType: data.contentType ?? undefined,
      fileExpiresAt: data.fileExpiresAt
        ? new Date(data.fileExpiresAt)
        : undefined,
      createdAt: new Date(data.createdAt),
    };
  }
}
