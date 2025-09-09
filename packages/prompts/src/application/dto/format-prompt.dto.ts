import { LanguageCode } from "../../domain/value-objects/language-code.value-object.js";

/**
 * Parameters for formatting a simple prompt.
 */
export interface FormatSimplePromptParams {
  promptName: string;
  variables?: Record<string, unknown>;
  language?: LanguageCode;
  correlationId?: string;
}

/**
 * Response from formatting a simple prompt with metadata.
 */
export interface FormattedPromptResponse {
  content: string;
  metadata: {
    promptId: string;
    promptName: string;
    version: string;
    languageUsed: string;
    variablesProvided: Record<string, unknown>;
    templateUsed: string;
    tags: string[];
    timestamp: Date;
    truncations?: Array<{
      field: string;
      originalLength: number;
      truncatedTo: number;
    }>;
    correlationId?: string;
    source?: string;
  };
}

/**
 * Parameters for formatting with truncation.
 */
export interface FormatWithTruncationParams extends FormatSimplePromptParams {
  maxLength?: number;
}
