import {
  Result,
  NotFoundError,
  InfrastructureError,
} from "@the-project-b/types";
import { ExtractionResult } from "../entities/ExtractionResult.entity.js";
import { AttachmentId } from "../value-objects/AttachmentId.value-object.js";

/**
 * Repository interface for extraction result persistence.
 * Defines contracts for saving and retrieving extraction results.
 */
export interface ExtractionResultRepository {
  /**
   * Saves an extraction result.
   */
  save(result: ExtractionResult): Promise<Result<void, InfrastructureError>>;

  /**
   * Finds an extraction result by attachment ID.
   */
  findByAttachmentId(
    id: AttachmentId,
  ): Promise<Result<ExtractionResult, NotFoundError>>;

  /**
   * Finds multiple extraction results by attachment IDs.
   */
  findByAttachmentIds(
    ids: AttachmentId[],
  ): Promise<Result<ExtractionResult[], NotFoundError>>;
}
