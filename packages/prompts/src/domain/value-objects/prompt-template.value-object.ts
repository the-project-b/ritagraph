import { Result } from "../../shared/types/result.js";
import {
  ValidationError,
  FormatError,
} from "../../shared/errors/domain.errors.js";

/**
 * Represents metadata about a formatted template.
 */
export interface FormattedTemplate {
  content: string;
  placeholdersReplaced: string[];
  originalTemplate: string;
}

/**
 * Immutable value object representing a prompt template string.
 * Handles placeholder extraction and variable substitution.
 */
export class PromptTemplate {
  // #region Constants
  private static readonly PLACEHOLDER_PATTERN = /\{(\w+)\}/g;
  // #endregion

  private readonly placeholders: Set<string>;

  private constructor(
    private readonly template: string,
    placeholders: Set<string>,
  ) {
    this.placeholders = placeholders;
  }

  // #region Factory Methods
  /**
   * Creates a PromptTemplate with automatic placeholder extraction.
   * @param template - The template string with {variable} placeholders
   * @returns Result<PromptTemplate, ValidationError> - Success with template or validation error
   */
  static create(template: string): Result<PromptTemplate, ValidationError> {
    if (typeof template !== "string") {
      return Result.failure(
        new ValidationError("Template must be a string", "template"),
      );
    }

    const placeholders = PromptTemplate.extractPlaceholders(template);
    return Result.success(new PromptTemplate(template, placeholders));
  }

  /**
   * Extracts placeholder names from a template string.
   * @param template - The template string to extract placeholders from
   * @returns Set<string> - Unique placeholder names found in template
   */
  private static extractPlaceholders(template: string): Set<string> {
    const placeholders = new Set<string>();
    const matches = template.matchAll(PromptTemplate.PLACEHOLDER_PATTERN);

    for (const match of matches) {
      if (match[1]) {
        placeholders.add(match[1]);
      }
    }

    return placeholders;
  }
  // #endregion

  // #region Formatting
  /**
   * Formats the template with provided variables.
   * @param variables - Key-value pairs for template substitution
   * @returns Result<FormattedTemplate, FormatError> - Formatted content or error with missing variables
   */
  format(
    variables: Record<string, unknown>,
  ): Result<FormattedTemplate, FormatError> {
    const missingVariables: string[] = [];
    const replacedVariables: string[] = [];

    for (const placeholder of this.placeholders) {
      if (!(placeholder in variables)) {
        missingVariables.push(placeholder);
      }
    }

    if (missingVariables.length > 0) {
      return Result.failure(
        new FormatError(
          `Missing required variables: ${missingVariables.join(", ")}`,
          missingVariables,
        ),
      );
    }

    let formattedContent = this.template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      if (formattedContent.includes(placeholder)) {
        const stringValue = this.convertToString(value);
        formattedContent = formattedContent.replace(
          new RegExp(`\\{${key}\\}`, "g"),
          stringValue,
        );
        replacedVariables.push(key);
      }
    }

    return Result.success({
      content: formattedContent,
      placeholdersReplaced: replacedVariables,
      originalTemplate: this.template,
    });
  }

  /**
   * Converts any value to a string representation for template substitution.
   * @param value - The value to convert to string
   * @returns string - String representation of the value
   */
  private convertToString(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.convertToString(item)).join("\n");
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

  // #region Getters
  /**
   * Returns the raw template string.
   * @returns string - The original template string
   */
  getTemplate(): string {
    return this.template;
  }

  /**
   * Returns the set of placeholder names found in the template.
   * @returns Set<string> - Copy of placeholder names
   */
  getPlaceholders(): Set<string> {
    return new Set(this.placeholders);
  }

  /**
   * Checks if the template contains any placeholders.
   * @returns boolean - True if template has placeholders
   */
  hasPlaceholders(): boolean {
    return this.placeholders.size > 0;
  }

  /**
   * Checks if a specific placeholder exists in the template.
   * @param name - The placeholder name to check
   * @returns boolean - True if placeholder exists
   */
  hasPlaceholder(name: string): boolean {
    return this.placeholders.has(name);
  }
  // #endregion

  // #region Comparison
  /**
   * Value equality comparison with another template.
   * @param other - The template to compare with
   * @returns boolean - True if templates are equal
   */
  equals(other: PromptTemplate): boolean {
    return this.template === other.template;
  }

  /**
   * String representation of the template.
   * @returns string - The template string
   */
  toString(): string {
    return this.template;
  }
  // #endregion
}
