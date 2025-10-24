import { ExtractionResult } from "../../domain/entities/ExtractionResult.entity.js";

/**
 * Formatter that produces hybrid output: text + markdown tables and key-value pairs.
 * This is the default formatter providing a balance between readability and structure.
 */
export class HybridFormatter {
  /**
   * Formats extraction result in hybrid mode.
   */
  format(result: ExtractionResult): string {
    return result.getFormattedOutput("hybrid");
  }
}
