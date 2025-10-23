import { ExtractionResult } from "../../domain/entities/ExtractionResult.entity.js";

/**
 * Formatter that produces full JSON structure with all details.
 * Provides maximum information retention at the cost of size and readability.
 */
export class FullStructureFormatter {
  /**
   * Formats extraction result in full mode.
   */
  format(result: ExtractionResult): string {
    return result.getFormattedOutput("full");
  }
}
