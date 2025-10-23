import { err, ok, Result, ValidationError } from "@the-project-b/types";
import { Document } from "../entities/Document.entity.js";
import {
  CostMetrics,
  ExtractionResult,
} from "../entities/ExtractionResult.entity.js";
import { ExtractionConfig } from "../value-objects/ExtractionConfig.value-object.js";

/**
 * Domain service for orchestrating extraction workflows.
 * Contains business logic for aggregating results and managing costs.
 */
export class ExtractionOrchestrator {
  /**
   * Aggregates cost metrics from multiple extraction results.
   */
  aggregateCosts(results: ExtractionResult[]): CostMetrics {
    const totalCost = results.reduce(
      (acc, result) => {
        const cost = result.getCost();
        return {
          pages: acc.pages + cost.pages,
          apiCalls: acc.apiCalls + cost.apiCalls,
          estimatedCostUSD: acc.estimatedCostUSD + cost.estimatedCostUSD,
        };
      },
      { pages: 0, apiCalls: 0, estimatedCostUSD: 0 },
    );

    return totalCost;
  }

  /**
   * Validates extraction quality based on confidence scores.
   */
  validateQuality(
    results: ExtractionResult[],
  ): Result<QualityReport, ValidationError> {
    const lowConfidenceResults = results.filter(
      (result) => !result.isHighConfidence(),
    );

    const averageConfidence =
      results.reduce(
        (sum, result) => sum + result.getMetadata().confidence.getValue(),
        0,
      ) / results.length;

    const qualityReport: QualityReport = {
      totalResults: results.length,
      highConfidenceCount: results.length - lowConfidenceResults.length,
      lowConfidenceCount: lowConfidenceResults.length,
      averageConfidence,
      lowConfidenceResults: lowConfidenceResults.map((result) => ({
        filename: result.getFilename(),
        confidence: result.getMetadata().confidence.getValue(),
      })),
    };

    return ok(qualityReport);
  }

  /**
   * Determines if a document should be processed asynchronously.
   * All extraction now uses async processing for reliability.
   */
  shouldUseAsyncProcessing(
    document: Document,
    config: ExtractionConfig,
  ): boolean {
    return true;
  }

  /**
   * Calculates estimated processing time based on document properties.
   * All extraction uses async processing.
   */
  estimateProcessingTime(document: Document, config: ExtractionConfig): number {
    const baseTimePerMB = 5000;
    const sizeMB = document.getSizeMB();
    const estimated = Math.ceil(sizeMB * baseTimePerMB);

    return estimated;
  }

  /**
   * Validates that extraction config is appropriate for document.
   */
  validateConfigForDocument(
    document: Document,
    config: ExtractionConfig,
  ): Result<void, ValidationError> {
    if (document.isArchive() && config.getArchiveConfig().maxDepth < 1) {
      return err(
        new ValidationError("Archive requires maxDepth >= 1", {
          documentType: document.getType().toString(),
          maxDepth: config.getArchiveConfig().maxDepth,
        }),
      );
    }

    return ok(undefined);
  }
}

export type QualityReport = {
  totalResults: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  averageConfidence: number;
  lowConfidenceResults: Array<{
    filename: string;
    confidence: number;
  }>;
};
