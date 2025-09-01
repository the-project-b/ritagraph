import { Result } from "../../shared/types/result.js";
import {
  FormatError,
  ValidationError,
} from "../../shared/errors/domain.errors.js";
import { PromptTemplate } from "../value-objects/prompt-template.value-object.js";
import { PromptVariables } from "../value-objects/prompt-variables.value-object.js";

/**
 * Result of formatting operation with detailed metadata.
 */
export interface FormattingResult {
  content: string;
  variablesUsed: Record<string, unknown>;
  variablesMissing: string[];
  placeholdersReplaced: string[];
  truncations?: Array<{
    field: string;
    originalLength: number;
    truncatedTo: number;
  }>;
}

/**
 * Domain service for prompt formatting operations.
 * Handles variable substitution, validation, and content manipulation.
 */
export class PromptFormatterService {
  // #region Formatting
  /**
   * Formats a template with validated variables.
   * @param template - The prompt template to format
   * @param variables - Variable definitions for validation
   * @param values - Actual values to substitute
   * @returns Result<FormattingResult, FormatError> - Formatted result or error
   */
  formatWithVariables(
    template: PromptTemplate,
    variables: PromptVariables,
    values: Record<string, unknown>,
  ): Result<FormattingResult, FormatError> {
    const validationResult = variables.validate(values);
    if (Result.isFailure(validationResult)) {
      const error = Result.unwrapFailure(validationResult);
      return Result.failure(
        new FormatError(`Variable validation failed: ${error.message}`),
      );
    }

    const validatedValues = Result.unwrap(validationResult);
    const formatResult = template.format(validatedValues);

    if (Result.isFailure(formatResult)) {
      return formatResult as Result<never, FormatError>;
    }

    const formatted = Result.unwrap(formatResult);

    const result: FormattingResult = {
      content: formatted.content,
      variablesUsed: validatedValues,
      variablesMissing: [],
      placeholdersReplaced: formatted.placeholdersReplaced,
    };

    return Result.success(result);
  }

  /**
   * Formats a template without variable validation.
   * @param template - The prompt template to format
   * @param values - Values to substitute
   * @returns Result<FormattingResult, FormatError> - Formatted result or error
   */
  formatWithoutValidation(
    template: PromptTemplate,
    values: Record<string, unknown>,
  ): Result<FormattingResult, FormatError> {
    const formatResult = template.format(values);

    if (Result.isFailure(formatResult)) {
      const error = Result.unwrapFailure(formatResult);
      return Result.failure(error);
    }

    const formatted = Result.unwrap(formatResult);

    const result: FormattingResult = {
      content: formatted.content,
      variablesUsed: values,
      variablesMissing: [],
      placeholdersReplaced: formatted.placeholdersReplaced,
    };

    return Result.success(result);
  }
  // #endregion

  // #region Content Manipulation
  /**
   * Truncates content to a maximum length.
   * @param content - The content to truncate
   * @param maxLength - Maximum allowed length
   * @returns FormattingResult - Result with truncation metadata
   */
  truncateContent(content: string, maxLength: number): FormattingResult {
    const originalLength = content.length;

    if (originalLength <= maxLength) {
      return {
        content,
        variablesUsed: {},
        variablesMissing: [],
        placeholdersReplaced: [],
      };
    }

    return {
      content: content.slice(0, maxLength),
      variablesUsed: {},
      variablesMissing: [],
      placeholdersReplaced: [],
      truncations: [
        {
          field: "content",
          originalLength,
          truncatedTo: maxLength,
        },
      ],
    };
  }

  /**
   * Combines multiple formatted contents.
   * @param contents - Array of formatted contents
   * @param separator - Separator between contents
   * @returns string - Combined content
   */
  combineContents(contents: string[], separator: string = "\n\n"): string {
    return contents.filter((c) => c && c.trim().length > 0).join(separator);
  }

  /**
   * Appends a suffix to content if condition is met.
   * @param content - The base content
   * @param suffix - The suffix to append
   * @param condition - Whether to append
   * @returns string - Content with or without suffix
   */
  appendConditionally(
    content: string,
    suffix: string,
    condition: boolean,
  ): string {
    return condition ? `${content}${suffix}` : content;
  }
  // #endregion

  // #region Validation
  /**
   * Validates that all required variables have values.
   * @param required - Required variable definitions
   * @param provided - Provided values
   * @returns Result<void, ValidationError> - Success or validation error
   */
  validateVariables(
    required: PromptVariables,
    provided: Record<string, unknown>,
  ): Result<void, ValidationError> {
    const requiredNames = required.getRequiredNames();
    const missing = requiredNames.filter((name) => !(name in provided));

    if (missing.length > 0) {
      return Result.failure(
        new ValidationError(
          `Missing required variables: ${missing.join(", ")}`,
          "variables",
        ),
      );
    }

    return Result.success(void 0);
  }

  /**
   * Checks if a value can be formatted as a string.
   * @param value - The value to check
   * @returns boolean - True if value can be stringified
   */
  canStringify(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
      return true;
    }

    if (Array.isArray(value)) {
      return value.every((item) => this.canStringify(item));
    }

    if (type === "object") {
      try {
        JSON.stringify(value);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }
  // #endregion

  // #region Array Formatting
  /**
   * Formats an array of values as a bullet list.
   * @param items - Array of items to format
   * @param bullet - Bullet character to use
   * @returns string - Formatted bullet list
   */
  formatAsList(items: unknown[], bullet: string = "-"): string {
    return items
      .map((item) => `${bullet} ${this.stringifyValue(item)}`)
      .join("\n");
  }

  /**
   * Formats an array as a numbered list.
   * @param items - Array of items to format
   * @returns string - Formatted numbered list
   */
  formatAsNumberedList(items: unknown[]): string {
    return items
      .map((item, index) => `${index + 1}. ${this.stringifyValue(item)}`)
      .join("\n");
  }

  /**
   * Converts any value to string representation.
   * @param value - Value to stringify
   * @returns string - String representation
   */
  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }
  // #endregion
}
