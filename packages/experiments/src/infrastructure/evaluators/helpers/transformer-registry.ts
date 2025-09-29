import { TransformerContext } from "./validation-config.js";
import {
  TemplateVariableRegistry,
  TemplateContext as TemplateVarContext,
} from "./template-variable-registry.js";

/**
 * Predefined transformer function type
 */
export type TransformerFunction = (
  value: unknown,
  context?: TransformerContext,
) => unknown;

/**
 * Registry entry for a transformer with its configuration
 */
export interface RegisteredTransformer {
  key: string;
  description: string;
  transform: TransformerFunction;
  strategy?: "add-missing-only" | "transform-always" | "transform-existing";
  when?: {
    path: string;
    equals?: unknown | unknown[];
    notEquals?: unknown | unknown[];
    exists?: boolean;
  };
  conditionTarget?: "self" | "actual" | "expected";
}

/**
 * Get today's date at UTC midnight in ISO format
 */
function getTodayAtUtcMidnight(): string {
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDay = now.getUTCDate();

  return new Date(
    Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0),
  ).toISOString();
}

/**
 * Predefined transformer definitions registry
 *
 * TRANSFORMER CONFIGURATION GUIDE:
 *
 * Each transformer can be configured with the following properties:
 *
 * 1. STRATEGIES - Controls when and how transformations are applied:
 *
 *    - "add-missing-only": Adds field to EXPECTED only if missing.
 *      Behavior: Expected missing → Add | Expected exists → Skip | Actual → Never touched
 *      Use case: Default values that should be in expected outputs.
 *      Example: Adding today's date to expected when not specified.
 *
 *    - "transform-always": Transforms values on BOTH sides if they exist.
 *      Behavior: Field missing → Skip | Field exists → Transform on both sides
 *      Use case: Normalizing formats that vary (dates, strings, numbers).
 *      Example: Converting all dates to same timezone/format for comparison.
 *
 *    - "transform-existing": Only transforms fields that exist, skips missing.
 *      Behavior: Field missing → Stays missing | Field exists → Transform
 *      Applied to: BOTH expected and actual independently
 *      Use case: Optional fields that need normalization when present.
 *      Example: MDC date fields that LLM may or may not generate.
 *
 *    - "add-if-actual-has": Adds to EXPECTED based on ACTUAL's content.
 *      Behavior: Check if actual has field → If yes, add to expected → If no, skip
 *      Use case: Dynamic validation when LLM inconsistently generates fields.
 *      Example: MDC dates - validate if LLM generates them, ignore if not.
 *
 * 2. CONDITIONAL APPLICATION - The 'when' property:
 *
 *    Controls when a transformer should apply based on proposal content:
 *
 *    when: {
 *      path: "changeType",        // Path to check in the proposal
 *      equals: "change",          // Value must equal this (or array for OR logic)
 *      notEquals: "creation",     // Value must NOT equal this
 *      exists: true               // Path must exist (regardless of value)
 *    }
 *
 * 3. CONDITION TARGET - The 'conditionTarget' property:
 *
 *    Determines which proposal to check the 'when' condition against:
 *
 *    - "self" (default): Check condition on the proposal being transformed
 *    - "actual": Check condition on the actual (LLM output) proposal
 *    - "expected": Check condition on the expected proposal
 *
 *    Key insight: "actual" is crucial for "add-if-actual-has" strategy,
 *    allowing dynamic field addition based on LLM output.
 *
 * 4. THREE-LAYER USAGE SYSTEM:
 *
 *    Priority: Proposal > Example > Global (complete override, not additive)
 *
 *    Layer 1 - Global (in evaluator code):
 *    ```typescript
 *    transformers: {
 *      "mutationVariables.data.effectiveDate": "transformer-today-utc-for-change"
 *    }
 *    ```
 *
 *    Layer 2 - Example level (in LangSmith dataset):
 *    ```json
 *    {
 *      "validationConfig": {
 *        "transformers": {
 *          "relatedUserId": "transformer-uppercase",
 *          "mutationVariables.data.effectiveDate": "transformer-today-utc"
 *        }
 *      }
 *    }
 *    ```
 *
 *    Layer 3 - Proposal level (on individual proposals):
 *    ```json
 *    {
 *      "expectedDataProposal": [{
 *        "changeType": "change",
 *        "transformers": {
 *          "relatedUserId": "transformer-lowercase"
 *        }
 *      }]
 *    }
 *    ```
 *
 * 5. EMPTY OBJECT OVERRIDE:
 *
 *    Using `transformers: {}` means NO transformers apply at that level.
 *    This completely overrides parent layers with "no transformation".
 *
 * COMMON PATTERNS:
 *
 * Pattern 1 - Conditional date addition:
 *   Use "add-missing-only" + "conditionTarget: actual" + when condition
 *   to add dates to expected based on LLM's changeType.
 *
 * Pattern 2 - Format normalization:
 *   Use "transform-always" for consistent formatting across all proposals.
 *
 * Pattern 3 - Proposal-specific overrides:
 *   Set transformers on individual proposals to handle special cases.
 */
const TRANSFORMER_DEFINITIONS: RegisteredTransformer[] = [
  {
    key: "transformer-today-utc",
    description: "Sets value to today at UTC midnight",
    transform: () => getTodayAtUtcMidnight(),
    strategy: "add-missing-only",
  },
  {
    key: "transformer-today-utc-for-change",
    description:
      "Sets effectiveDate to today at UTC midnight for change proposals",
    transform: () => getTodayAtUtcMidnight(),
    strategy: "add-missing-only",
    when: {
      path: "changeType",
      equals: "change",
    },
    conditionTarget: "actual",
  },
  {
    key: "transformer-today-utc-for-creation",
    description:
      "Sets startDate to today at UTC midnight for creation proposals",
    transform: () => getTodayAtUtcMidnight(),
    strategy: "add-missing-only",
    when: {
      path: "changeType",
      equals: "creation",
    },
    conditionTarget: "actual",
  },
  {
    key: "transformer-uppercase",
    description: "Converts value to uppercase string",
    transform: (value) => {
      if (typeof value === "string") {
        return value.toUpperCase();
      }
      return value;
    },
    strategy: "transform-always",
  },
  {
    key: "transformer-lowercase",
    description: "Converts value to lowercase string",
    transform: (value) => {
      if (typeof value === "string") {
        return value.toLowerCase();
      }
      return value;
    },
    strategy: "transform-always",
  },
  {
    key: "transformer-trim",
    description: "Trims whitespace from string values",
    transform: (value) => {
      if (typeof value === "string") {
        return value.trim();
      }
      return value;
    },
    strategy: "transform-always",
  },
  {
    key: "transformer-boolean-true",
    description: "Sets value to boolean true",
    transform: () => true,
    strategy: "add-missing-only",
  },
  {
    key: "transformer-boolean-false",
    description: "Sets value to boolean false",
    transform: () => false,
    strategy: "add-missing-only",
  },
  {
    key: "transformer-empty-array",
    description: "Sets value to empty array",
    transform: () => [],
    strategy: "add-missing-only",
  },
  {
    key: "transformer-empty-object",
    description: "Sets value to empty object",
    transform: () => ({}),
    strategy: "add-missing-only",
  },
];

/**
 * Transformer registry for managing predefined transformers
 */
export class TransformerRegistry {
  private static transformers = new Map<string, RegisteredTransformer>(
    TRANSFORMER_DEFINITIONS.map((t) => [t.key, t]),
  );

  /**
   * Get a transformer by its key, with support for dynamic template-based transformers
   */
  static get(key: string): RegisteredTransformer | undefined {
    const existing = this.transformers.get(key);
    if (existing) {
      return existing;
    }

    if (key.startsWith("transformer-template-")) {
      const templateExpression = key.replace("transformer-template-", "");
      const dynamicTransformer =
        this.createTemplateTransformer(templateExpression);
      if (dynamicTransformer) {
        this.transformers.set(key, dynamicTransformer);
        return dynamicTransformer;
      }
    }

    return undefined;
  }

  /**
   * Check if a transformer exists
   */
  static has(key: string): boolean {
    if (this.transformers.has(key)) {
      return true;
    }

    if (key.startsWith("transformer-template-")) {
      const templateExpression = key.replace("transformer-template-", "");
      return this.canCreateTemplateTransformer(templateExpression);
    }

    return false;
  }

  /**
   * Get all transformer keys
   */
  static getKeys(): string[] {
    return Array.from(this.transformers.keys());
  }

  /**
   * Get all transformers
   */
  static getAll(): RegisteredTransformer[] {
    return Array.from(this.transformers.values());
  }

  /**
   * Create a dynamic transformer from a template variable expression
   */
  private static createTemplateTransformer(
    expression: string,
  ): RegisteredTransformer | null {
    const context: TemplateVarContext = {
      currentDate: new Date(),
    };

    const testResult = TemplateVariableRegistry.evaluateExpression(
      expression,
      context,
    );
    if (!testResult) {
      return null;
    }

    return {
      key: `transformer-template-${expression}`,
      description: `Dynamic transformer for template expression: ${expression}`,
      transform: (value, transformerContext) => {
        const evalContext: TemplateVarContext = {
          currentDate: transformerContext?.currentDate || new Date(),
        };

        const result = TemplateVariableRegistry.evaluateExpression(
          expression,
          evalContext,
        );
        return result ? result.dataValue : value;
      },
      strategy: "add-missing-only",
    };
  }

  /**
   * Check if a template transformer can be created
   */
  private static canCreateTemplateTransformer(expression: string): boolean {
    const context: TemplateVarContext = {
      currentDate: new Date(),
    };

    return (
      TemplateVariableRegistry.evaluateExpression(expression, context) !== null
    );
  }
}

/**
 * Default transformer configurations for data change proposals
 * These are the Layer 1 (global) defaults that were previously inline
 */
export const DEFAULT_TRANSFORMER_MAPPINGS: Record<string, string> = {
  "mutationVariables.data.effectiveDate": "transformer-today-utc-for-change",
  "mutationVariables.data.startDate": "transformer-today-utc-for-creation",
};
