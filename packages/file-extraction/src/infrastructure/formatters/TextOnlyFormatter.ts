import { ExtractionResult } from "../../domain/entities/ExtractionResult.entity.js";

/**
 * Formatter that produces plain text only output.
 * Fastest and simplest format with no structure preservation.
 */
export class TextOnlyFormatter {
  /**
   * Formats extraction result as plain text.
   */
  format(result: ExtractionResult): string {
    return result.getFormattedOutput("text-only");
  }
}
