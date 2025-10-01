import {
  TemplateVariableRegistry,
  TemplateContext,
  TemplateEvaluationResult,
} from "./template-variable-registry.js";

/**
 * Information about a single template replacement
 */
export interface TemplateReplacement {
  original: string;
  expression: string;
  result: TemplateEvaluationResult;
  startIndex: number;
  endIndex: number;
}

/**
 * Result of processing a template string
 */
export interface TemplateProcessingResult {
  original: string;
  processed: string;
  replacements: TemplateReplacement[];
  metadata: Record<string, TemplateEvaluationResult>;
}

/**
 * Configuration for template delimiters
 */
export interface TemplateDelimiters {
  start: string;
  end: string;
}

/**
 * Processes template variables in strings
 */
export class TemplateProcessor {
  // Default to double braces to avoid conflicts with LangSmith templates
  private static delimiters: TemplateDelimiters = {
    start: "{{",
    end: "}}",
  };

  /**
   * Configure the template delimiters
   * @param delimiters The start and end delimiters to use
   */
  static setDelimiters(delimiters: TemplateDelimiters): void {
    this.delimiters = delimiters;
  }

  /**
   * Get the current template delimiters
   */
  static getDelimiters(): TemplateDelimiters {
    return { ...this.delimiters };
  }

  /**
   * Build the regex pattern based on current delimiters
   */
  private static buildPattern(): RegExp {
    // Escape special regex characters in delimiters
    const escapeRegex = (str: string) =>
      str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startEscaped = escapeRegex(this.delimiters.start);
    const endEscaped = escapeRegex(this.delimiters.end);

    // Pattern matches: delimiter + variable name with optional arithmetic + delimiter
    return new RegExp(`${startEscaped}(\\w+(?:[+-]\\d+)?)${endEscaped}`, "g");
  }

  /**
   * Process template variables in a string
   */
  static process(
    input: string,
    context: TemplateContext,
  ): TemplateProcessingResult {
    const replacements: TemplateReplacement[] = [];
    const metadata: Record<string, TemplateEvaluationResult> = {};

    let processed = input;
    let offset = 0;

    const pattern = this.buildPattern();
    const matches = Array.from(input.matchAll(pattern));

    for (const match of matches) {
      const [fullMatch, expression] = match;
      const startIndex = match.index!;

      const result = TemplateVariableRegistry.evaluateExpression(
        expression,
        context,
      );

      if (result) {
        const replacement: TemplateReplacement = {
          original: fullMatch,
          expression,
          result,
          startIndex: startIndex + offset,
          endIndex: startIndex + offset + fullMatch.length,
        };

        replacements.push(replacement);
        metadata[expression] = result;

        const newText = result.displayValue;
        processed =
          processed.slice(0, startIndex + offset) +
          newText +
          processed.slice(startIndex + offset + fullMatch.length);

        offset += newText.length - fullMatch.length;
      }
    }

    return {
      original: input,
      processed,
      replacements,
      metadata,
    };
  }

  /**
   * Check if a string contains template variables
   */
  static hasTemplates(input: string): boolean {
    const pattern = this.buildPattern();
    // Remove the 'g' flag for test()
    const testPattern = new RegExp(pattern.source);
    return testPattern.test(input);
  }

  /**
   * Extract all template expressions from a string
   */
  static extractExpressions(input: string): string[] {
    const pattern = this.buildPattern();
    const matches = input.matchAll(pattern);
    return Array.from(matches, (m) => m[1]);
  }
}
