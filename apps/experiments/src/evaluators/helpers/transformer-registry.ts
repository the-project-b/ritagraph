import { TransformerContext } from "./validation-config.js";

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
 * Predefined transformer definitions
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
   * Get a transformer by its key
   */
  static get(key: string): RegisteredTransformer | undefined {
    return this.transformers.get(key);
  }

  /**
   * Check if a transformer exists
   */
  static has(key: string): boolean {
    return this.transformers.has(key);
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
}

/**
 * Default transformer configurations for data change proposals
 * These are the Layer 1 (global) defaults that were previously inline
 */
export const DEFAULT_TRANSFORMER_MAPPINGS: Record<string, string> = {
  "mutationVariables.data.effectiveDate": "transformer-today-utc-for-change",
  "mutationVariables.data.startDate": "transformer-today-utc-for-creation",
};
