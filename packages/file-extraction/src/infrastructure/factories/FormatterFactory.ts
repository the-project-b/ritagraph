import { ExtractionDetailLevel } from "../../domain/value-objects/ExtractionConfig.value-object.js";
import { ExtractionResult } from "../../domain/entities/ExtractionResult.entity.js";
import { HybridFormatter } from "../formatters/HybridFormatter.js";
import { FullStructureFormatter } from "../formatters/FullStructureFormatter.js";
import { TextOnlyFormatter } from "../formatters/TextOnlyFormatter.js";

export type Formatter = {
  format(result: ExtractionResult): string;
};

/**
 * Factory for creating formatters based on detail level.
 */
export class FormatterFactory {
  /**
   * Creates a formatter for the specified detail level.
   */
  static create(detailLevel: ExtractionDetailLevel): Formatter {
    switch (detailLevel) {
      case "text-only":
        return new TextOnlyFormatter();
      case "full":
        return new FullStructureFormatter();
      case "hybrid":
      default:
        return new HybridFormatter();
    }
  }
}
