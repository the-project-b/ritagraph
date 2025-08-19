import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "experiments" }).child({
  module: "ValidationConfig",
});

/**
 * Configuration for proposal validation with strict matching
 */
export interface ValidationConfig {
  /**
   * Paths to ignore during validation (still shown in diffs)
   * Supports dot notation and wildcards:
   * - "mutationVariables.data.effectiveDate" - exact path
   * - "mutationVariables.metadata.*" - wildcard for all nested paths
   */
  ignorePaths: string[];

  /**
   * Path-specific transformer functions
   * Applied to both expected and actual values before comparison
   * Common use case: dynamic date substitution
   */
  transformers?: Record<
    string,
    (value: any, context?: TransformerContext) => any
  >;
}

/**
 * Context passed to transformer functions
 */
export interface TransformerContext {
  path: string;
  isExpected: boolean;
  currentDate?: Date;
}

/**
 * Default validation config for data change proposals
 */
export function getDefaultValidationConfig(
  now: Date = new Date(),
): ValidationConfig {
  // Compute today's date at UTC midnight
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDay = now.getUTCDate();
  const todayAtUtcMidnight = new Date(
    Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0),
  ).toISOString();

  return {
    ignorePaths: [],
    transformers: {
      // Transform date fields to today's date for both expected and actual
      // Note: effectiveDate is used for "change" type, startDate for "creation" type
      "mutationVariables.data.effectiveDate": () => todayAtUtcMidnight,
      "mutationVariables.data.startDate": () => todayAtUtcMidnight,
    },
  };
}

/**
 * Checks if a path should be ignored based on configuration
 */
export function shouldIgnorePath(
  path: string,
  config: ValidationConfig,
): boolean {
  return config.ignorePaths.some((ignorePath) => {
    // Support wildcards: "metadata.*" matches any nested path
    if (ignorePath.endsWith(".*")) {
      const prefix = ignorePath.slice(0, -2);
      return path.startsWith(prefix + ".") || path === prefix;
    }
    return path === ignorePath;
  });
}

/**
 * Gets the transformer function for a path if one exists
 */
export function getPathTransformer(
  path: string,
  config: ValidationConfig,
): ((value: any, context?: TransformerContext) => any) | undefined {
  if (!config.transformers) return undefined;

  // Check exact match first
  if (config.transformers[path]) {
    return config.transformers[path];
  }

  // Check for wildcard transformers
  for (const [pattern, transformer] of Object.entries(config.transformers)) {
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      if (path.startsWith(prefix + ".") || path === prefix) {
        return transformer;
      }
    }
  }

  return undefined;
}

/**
 * Applies transformers to a value at a specific path
 */
export function applyTransformer(
  value: any,
  path: string,
  config: ValidationConfig,
  isExpected: boolean,
  currentDate?: Date,
): any {
  const transformer = getPathTransformer(path, config);
  if (!transformer) return value;

  const context: TransformerContext = {
    path,
    isExpected,
    currentDate,
  };

  try {
    return transformer(value, context);
  } catch (error) {
    logger.warn("Failed to apply transformer", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return value;
  }
}
