import { createLogger } from "@the-project-b/logging";
import { CostMetrics } from "../../domain/entities/ExtractionResult.entity.js";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "TextractCostTracker",
});

export type TextractOperation = "DetectDocumentText" | "AnalyzeDocument";

/**
 * Tracks AWS Textract costs based on API usage.
 * this is really more of a 'guess' than it is actual tracking because we don't get cost stats back from AWS textract...
 */
export class TextractCostTracker {
  private pageCount: number = 0;
  private apiCallCount: number = 0;
  private detectTextPageCount: number = 0;
  private analyzeDocumentPageCount: number = 0;

  private readonly COST_PER_PAGE_DETECT = 0.0015;
  private readonly COST_PER_PAGE_ANALYZE = 0.05;

  /**
   * Tracks an API call and associated pages.
   */
  trackApiCall(operation: TextractOperation, pages: number): void {
    this.apiCallCount += 1;
    this.pageCount += pages;

    if (operation === "DetectDocumentText") {
      this.detectTextPageCount += pages;
    } else if (operation === "AnalyzeDocument") {
      this.analyzeDocumentPageCount += pages;
    }

    logger.info("Tracked Textract API call", {
      operation,
      pages,
      totalPages: this.pageCount,
      totalApiCalls: this.apiCallCount,
    });
  }

  /**
   * Returns the current cost metrics.
   */
  getCurrentCost(): CostMetrics {
    const detectTextCost = this.detectTextPageCount * this.COST_PER_PAGE_DETECT;
    const analyzeDocumentCost =
      this.analyzeDocumentPageCount * this.COST_PER_PAGE_ANALYZE;
    const totalCost = detectTextCost + analyzeDocumentCost;

    return {
      pages: this.pageCount,
      apiCalls: this.apiCallCount,
      estimatedCostUSD: parseFloat(totalCost.toFixed(4)),
    };
  }

  /**
   * Resets the cost tracker.
   */
  reset(): void {
    this.pageCount = 0;
    this.apiCallCount = 0;
    this.detectTextPageCount = 0;
    this.analyzeDocumentPageCount = 0;

    logger.info("Cost tracker reset");
  }

  /**
   * Returns a detailed breakdown of costs.
   */
  getDetailedBreakdown(): {
    detectText: { pages: number; costUSD: number };
    analyzeDocument: { pages: number; costUSD: number };
    total: CostMetrics;
  } {
    const detectTextCost = this.detectTextPageCount * this.COST_PER_PAGE_DETECT;
    const analyzeDocumentCost =
      this.analyzeDocumentPageCount * this.COST_PER_PAGE_ANALYZE;

    return {
      detectText: {
        pages: this.detectTextPageCount,
        costUSD: parseFloat(detectTextCost.toFixed(4)),
      },
      analyzeDocument: {
        pages: this.analyzeDocumentPageCount,
        costUSD: parseFloat(analyzeDocumentCost.toFixed(4)),
      },
      total: this.getCurrentCost(),
    };
  }
}
