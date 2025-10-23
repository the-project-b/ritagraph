import { Result, ok, err, ValidationError } from "@the-project-b/types";
import { AttachmentId } from "../value-objects/AttachmentId.value-object.js";
import { ConfidenceScore } from "../value-objects/ConfidenceScore.value-object.js";
import { ExtractionDetailLevel } from "../value-objects/ExtractionConfig.value-object.js";

export type Table = {
  rows: string[][];
  confidence: number;
};

export type KeyValue = {
  key: string;
  value: string;
  confidence: number;
};

export type Layout = {
  blockType: string;
  text: string;
  geometry: {
    boundingBox: {
      width: number;
      height: number;
      left: number;
      top: number;
    };
  };
};

export type StructuredData = {
  tables: Table[];
  forms: KeyValue[];
  layout: Layout[];
};

export type ExtractionMetadata = {
  pageCount: number;
  confidence: ConfidenceScore;
  language: string;
  processingTimeMs: number;
};

export type CostMetrics = {
  pages: number;
  apiCalls: number;
  estimatedCostUSD: number;
};

export type ExtractionResultProps = {
  attachmentId: AttachmentId;
  filename: string;
  extractedText: string;
  structuredData?: StructuredData;
  metadata: ExtractionMetadata;
  cost: CostMetrics;
};

/**
 * Entity representing the result of a document extraction.
 * Aggregates text, structured data, metadata, and cost information.
 */
export class ExtractionResult {
  private constructor(private readonly props: ExtractionResultProps) {}

  /**
   * Creates an ExtractionResult entity with validation.
   */
  static create(
    props: ExtractionResultProps,
  ): Result<ExtractionResult, ValidationError> {
    if (!props.filename || props.filename.trim().length === 0) {
      return err(
        new ValidationError("Filename cannot be empty", {
          field: "filename",
          value: props.filename,
        }),
      );
    }

    if (props.metadata.pageCount < 1) {
      return err(
        new ValidationError("Page count must be at least 1", {
          field: "metadata.pageCount",
          value: props.metadata.pageCount,
        }),
      );
    }

    if (props.metadata.processingTimeMs < 0) {
      return err(
        new ValidationError("Processing time cannot be negative", {
          field: "metadata.processingTimeMs",
          value: props.metadata.processingTimeMs,
        }),
      );
    }

    if (
      props.cost.pages < 0 ||
      props.cost.apiCalls < 0 ||
      props.cost.estimatedCostUSD < 0
    ) {
      return err(
        new ValidationError("Cost metrics cannot be negative", {
          field: "cost",
          value: props.cost,
        }),
      );
    }

    return ok(new ExtractionResult(props));
  }

  /**
   * Returns the attachment ID.
   */
  getAttachmentId(): AttachmentId {
    return this.props.attachmentId;
  }

  /**
   * Returns the filename.
   */
  getFilename(): string {
    return this.props.filename;
  }

  /**
   * Returns the extracted text.
   */
  getExtractedText(): string {
    return this.props.extractedText;
  }

  /**
   * Returns the structured data if available.
   */
  getStructuredData(): StructuredData | undefined {
    return this.props.structuredData;
  }

  /**
   * Returns the extraction metadata.
   */
  getMetadata(): ExtractionMetadata {
    return this.props.metadata;
  }

  /**
   * Returns the cost metrics.
   */
  getCost(): CostMetrics {
    return this.props.cost;
  }

  /**
   * Returns formatted output based on detail level.
   */
  getFormattedOutput(level: ExtractionDetailLevel): string {
    switch (level) {
      case "text-only":
        return this.props.extractedText;

      case "hybrid":
        return this.formatHybrid();

      case "full":
        return this.formatFull();
    }
  }

  /**
   * Checks if the extraction has high confidence.
   */
  isHighConfidence(): boolean {
    return this.props.metadata.confidence.isHigh();
  }

  /**
   * Checks if structured data is available.
   */
  hasStructuredData(): boolean {
    return this.props.structuredData !== undefined;
  }

  /**
   * Returns the number of tables found.
   */
  getTableCount(): number {
    return this.props.structuredData?.tables.length || 0;
  }

  /**
   * Returns the number of form fields found.
   */
  getFormFieldCount(): number {
    return this.props.structuredData?.forms.length || 0;
  }

  /**
   * Formats output in hybrid mode (text + markdown tables).
   */
  private formatHybrid(): string {
    let output = `# ${this.props.filename}\n\n`;
    output += `**Confidence:** ${this.props.metadata.confidence.toPercentage()}%\n`;
    output += `**Pages:** ${this.props.metadata.pageCount}\n`;
    output += `**Language:** ${this.props.metadata.language}\n\n`;
    output += `## Extracted Text\n\n${this.props.extractedText}\n\n`;

    if (
      this.props.structuredData?.tables &&
      this.props.structuredData.tables.length > 0
    ) {
      output += `## Tables\n\n`;
      this.props.structuredData.tables.forEach((table, index) => {
        output += `### Table ${index + 1}\n\n`;
        output += this.formatTableAsMarkdown(table);
        output += `\n\n`;
      });
    }

    if (
      this.props.structuredData?.forms &&
      this.props.structuredData.forms.length > 0
    ) {
      output += `## Form Fields\n\n`;
      this.props.structuredData.forms.forEach((kv) => {
        output += `- **${kv.key}:** ${kv.value}\n`;
      });
    }

    return output;
  }

  /**
   * Formats output in full mode (includes all structure).
   */
  private formatFull(): string {
    return JSON.stringify(
      {
        filename: this.props.filename,
        extractedText: this.props.extractedText,
        structuredData: this.props.structuredData,
        metadata: {
          pageCount: this.props.metadata.pageCount,
          confidence: this.props.metadata.confidence.getValue(),
          language: this.props.metadata.language,
          processingTimeMs: this.props.metadata.processingTimeMs,
        },
        cost: this.props.cost,
      },
      null,
      2,
    );
  }

  /**
   * Formats a table as markdown.
   */
  private formatTableAsMarkdown(table: Table): string {
    if (table.rows.length === 0) {
      return "";
    }

    const header = table.rows[0];
    const separator = header.map(() => "---");
    const dataRows = table.rows.slice(1);

    let markdown = `| ${header.join(" | ")} |\n`;
    markdown += `| ${separator.join(" | ")} |\n`;

    dataRows.forEach((row) => {
      markdown += `| ${row.join(" | ")} |\n`;
    });

    return markdown;
  }
}
