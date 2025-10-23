import {
  ExtractionDetailLevel,
  TextractFeature,
} from "../../domain/value-objects/ExtractionConfig.value-object.js";

export type ExtractionConfigDto = {
  detailLevel: ExtractionDetailLevel;
  retryConfig: {
    maxAttempts: number;
    backoffMs: number;
    backoffMultiplier: number;
  };
  textractConfig: {
    features: TextractFeature[];
  };
  archiveConfig: {
    maxDepth: number;
    maxFilesPerArchive: number;
  };
};

export { ExtractionDetailLevel, TextractFeature };
