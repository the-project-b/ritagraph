import { Result, ok } from "@the-project-b/types";
import { createLogger } from "@the-project-b/logging";
import { ExtractionResultDto } from "../dto/ExtractionResult.dto.js";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "ValidateExtractionQualityUseCase",
});

export type ValidationIssue = {
  severity: "low" | "medium" | "high";
  message: string;
  affectedFile: string;
};

export type ValidationSuggestion = {
  message: string;
  affectedFile: string;
};

export type FileValidationResult = {
  attachmentId: string;
  filename: string;
  isValid: boolean;
  confidence: number;
  issues: ValidationIssue[];
  suggestions: ValidationSuggestion[];
};

export type QualityValidationReport = {
  overallValid: boolean;
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
  averageConfidence: number;
  results: FileValidationResult[];
};

/**
 * Use case for validating extraction quality.
 * Performs automated quality checks on extraction results.
 */
export class ValidateExtractionQualityUseCase {
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.7;
  private readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.85;
  private readonly MIN_TEXT_LENGTH = 10;

  /**
   * Validates extraction quality for multiple results.
   */
  async execute(
    results: ExtractionResultDto[],
  ): Promise<Result<QualityValidationReport, never>> {
    logger.info("Starting quality validation", {
      resultCount: results.length,
    });

    const validationResults: FileValidationResult[] = [];

    for (const result of results) {
      const validation = this.validateSingleResult(result);
      validationResults.push(validation);
    }

    const validFiles = validationResults.filter((r) => r.isValid).length;
    const invalidFiles = validationResults.length - validFiles;

    const averageConfidence =
      validationResults.reduce((sum, r) => sum + r.confidence, 0) /
      validationResults.length;

    const report: QualityValidationReport = {
      overallValid: invalidFiles === 0,
      totalFiles: validationResults.length,
      validFiles,
      invalidFiles,
      averageConfidence,
      results: validationResults,
    };

    logger.info("Quality validation completed", {
      overallValid: report.overallValid,
      validFiles,
      invalidFiles,
      averageConfidence: averageConfidence.toFixed(2),
    });

    return ok(report);
  }

  /**
   * Validates a single extraction result.
   */
  private validateSingleResult(
    result: ExtractionResultDto,
  ): FileValidationResult {
    const issues: ValidationIssue[] = [];
    const suggestions: ValidationSuggestion[] = [];

    this.checkConfidence(result, issues, suggestions);
    this.checkTextLength(result, issues, suggestions);
    this.checkPageCount(result, issues);
    this.checkStructuredData(result, suggestions);

    const isValid = !issues.some((issue) => issue.severity === "high");

    return {
      attachmentId: result.attachmentId,
      filename: result.filename,
      isValid,
      confidence: result.metadata.confidence,
      issues,
      suggestions,
    };
  }

  /**
   * Checks confidence score and flags low confidence.
   */
  private checkConfidence(
    result: ExtractionResultDto,
    issues: ValidationIssue[],
    suggestions: ValidationSuggestion[],
  ): void {
    const confidence = result.metadata.confidence;

    if (confidence < this.LOW_CONFIDENCE_THRESHOLD) {
      issues.push({
        severity: "high",
        message: `Very low confidence score: ${(confidence * 100).toFixed(1)}%`,
        affectedFile: result.filename,
      });
      suggestions.push({
        message:
          "Consider manual review or re-processing with different settings",
        affectedFile: result.filename,
      });
    } else if (confidence < this.MEDIUM_CONFIDENCE_THRESHOLD) {
      issues.push({
        severity: "medium",
        message: `Low confidence score: ${(confidence * 100).toFixed(1)}%`,
        affectedFile: result.filename,
      });
      suggestions.push({
        message: "Manual verification recommended",
        affectedFile: result.filename,
      });
    }
  }

  /**
   * Checks if extracted text has sufficient content.
   */
  private checkTextLength(
    result: ExtractionResultDto,
    issues: ValidationIssue[],
    suggestions: ValidationSuggestion[],
  ): void {
    const textLength = result.extractedText.trim().length;

    if (textLength < this.MIN_TEXT_LENGTH) {
      issues.push({
        severity: "high",
        message: `Extracted text is too short: ${textLength} characters`,
        affectedFile: result.filename,
      });
      suggestions.push({
        message:
          "File may be blank, corrupted, or contain only images without text",
        affectedFile: result.filename,
      });
    }
  }

  /**
   * Checks if page count is reasonable.
   */
  private checkPageCount(
    result: ExtractionResultDto,
    issues: ValidationIssue[],
  ): void {
    if (result.metadata.pageCount === 0) {
      issues.push({
        severity: "high",
        message: "No pages detected in document",
        affectedFile: result.filename,
      });
    }
  }

  /**
   * Checks structured data availability and suggests improvements.
   */
  private checkStructuredData(
    result: ExtractionResultDto,
    suggestions: ValidationSuggestion[],
  ): void {
    if (!result.structuredData) {
      suggestions.push({
        message:
          "No structured data extracted - may benefit from FORMS/TABLES features",
        affectedFile: result.filename,
      });
      return;
    }

    const hasTablesOrForms =
      (result.structuredData.tables?.length || 0) > 0 ||
      (result.structuredData.forms?.length || 0) > 0;

    if (!hasTablesOrForms) {
      suggestions.push({
        message: "Document processed but no tables/forms detected",
        affectedFile: result.filename,
      });
    }
  }
}
