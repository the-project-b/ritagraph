import {
  Table,
  KeyValue,
  Layout,
  StructuredData,
} from "../../domain/entities/ExtractionResult.entity.js";

export type ExtractionResultDto = {
  attachmentId: string;
  filename: string;
  extractedText: string;
  structuredData?: StructuredData;
  metadata: {
    pageCount: number;
    confidence: number;
    language: string;
    processingTimeMs: number;
  };
  cost: {
    pages: number;
    apiCalls: number;
    estimatedCostUSD: number;
  };
};

export { Table, KeyValue, Layout, StructuredData };
