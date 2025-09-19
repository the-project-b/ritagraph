import {
  TemplateVariableRegistry,
  TemplateContext,
  TemplateEvaluationResult
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
 * Processes template variables in strings
 */
export class TemplateProcessor {
  private static readonly TEMPLATE_PATTERN = /\{(\w+(?:[+-]\d+)?)\}/g;

  /**
   * Process template variables in a string
   */
  static process(
    input: string,
    context: TemplateContext
  ): TemplateProcessingResult {
    const replacements: TemplateReplacement[] = [];
    const metadata: Record<string, TemplateEvaluationResult> = {};

    let processed = input;
    let offset = 0;

    const matches = Array.from(input.matchAll(this.TEMPLATE_PATTERN));

    for (const match of matches) {
      const [fullMatch, expression] = match;
      const startIndex = match.index!;

      const result = TemplateVariableRegistry.evaluateExpression(expression, context);

      if (result) {
        const replacement: TemplateReplacement = {
          original: fullMatch,
          expression,
          result,
          startIndex: startIndex + offset,
          endIndex: startIndex + offset + fullMatch.length
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
      metadata
    };
  }

  /**
   * Check if a string contains template variables
   */
  static hasTemplates(input: string): boolean {
    const regex = /\{([^}]+)\}/;
    return regex.test(input);
  }

  /**
   * Extract all template expressions from a string
   */
  static extractExpressions(input: string): string[] {
    const matches = input.matchAll(this.TEMPLATE_PATTERN);
    return Array.from(matches, m => m[1]);
  }
}