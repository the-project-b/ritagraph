import { createEvaluationLogger } from "../core/evaluation-context.js";
import {
  deepClone,
  getValueAtPath,
  hasValueAtPath,
  pathMatchesPattern,
  setValueAtPath,
} from "./object-utils.js";

const logger = createEvaluationLogger("experiments", "ValidationConfig");

/**
 * Field extraction configuration for normalization
 */
export interface FieldExtractor<T = any> {
  /**
   * Source path in the original object (using dot notation)
   * Special values:
   * - '__self__': Use the entire object
   * - '__literal__': Use a literal value (specified in defaultValue)
   */
  from: string;

  /**
   * Default value if field is missing
   */
  defaultValue?: T;

  /**
   * Optional transformation to apply during extraction
   */
  transform?: (value: any) => T;
}

/**
 * Normalization configuration for a specific proposal type
 */
export interface NormalizationConfig {
  /**
   * Discriminator field value to match (e.g., 'change' or 'creation')
   * If not specified, this config applies to all proposals
   */
  when?: string;

  /**
   * Fields to extract and their mappings
   * Target field name -> extraction config or direct source path
   */
  fields: Record<string, string | FieldExtractor>;
}

/**
 * Transformer strategy types
 */
export enum TransformerStrategy {
  /** Add if missing in expected, don't transform if present */
  AddMissingOnly = "add-missing-only",
  /** Always transform values on both sides */
  TransformAlways = "transform-always",
  /** Only transform if field exists, ignore if missing */
  TransformExisting = "transform-existing",
}

/**
 * Condition for when a transformer should apply
 */
export interface TransformerCondition {
  /**
   * Path to check for the condition (e.g., "changeType", "mutationVariables.type")
   */
  path: string;

  /**
   * Expected value at that path (e.g., "change", "creation")
   * Can be a single value or array of values to match any
   */
  equals?: unknown | unknown[];

  /**
   * Check if the path exists (regardless of value)
   */
  exists?: boolean;

  /**
   * Check if the value at path does NOT equal this
   */
  notEquals?: unknown | unknown[];
}

/**
 * Transformer configuration for a specific path
 */
export interface TransformerConfig {
  /**
   * The transformation function
   */
  transform: (value: unknown, context?: TransformerContext) => unknown;

  /**
   * High-level strategy for this transformer (recommended approach)
   */
  strategy?: TransformerStrategy;

  /**
   * Optional condition for when this transformer should apply
   * If not specified, transformer always applies (backward compatible)
   */
  when?: TransformerCondition | TransformerCondition[];

  /**
   * Which proposal to check the condition against
   * - "self" (default): Check condition on the same proposal being transformed
   * - "actual": Check condition on the actual (LLM output) proposal
   * - "expected": Check condition on the expected proposal
   * This is useful when you want to add fields to expected based on what the LLM generated
   */
  conditionTarget?: "self" | "actual" | "expected";

  /**
   * Legacy/custom configuration (used when strategy is not specified)
   */
  onMissing?: "skip" | "add" | "fail";
  onExisting?: "transform" | "skip";
  applyTo?: "both" | "expected" | "actual";
}

/**
 * Configuration for proposal validation with strict matching
 */
export interface ValidationConfig {
  /**
   * Normalization rules for extracting fields from raw proposals
   * Applied to actual proposals before comparison
   * Array allows different configs for different proposal types (discriminated unions)
   */
  normalization?: NormalizationConfig[];

  /**
   * Paths to ignore during validation (still shown in diffs)
   * Supports dot notation and wildcards:
   * - "mutationVariables.data.effectiveDate" - exact path
   * - "mutationVariables.metadata.*" - wildcard for all nested paths
   */
  ignorePaths: string[];

  /**
   * Path-specific transformer configurations
   * Can be either a simple function (backward compatible) or full config
   */
  transformers?: Record<
    string,
    ((value: any, context?: TransformerContext) => any) | TransformerConfig
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
 * Checks if a path should be ignored based on configuration
 */
export function shouldIgnorePath(
  path: string,
  config: ValidationConfig,
): boolean {
  const isIgnored = config.ignorePaths.some((ignorePath) =>
    pathMatchesPattern(path, ignorePath),
  );

  if (isIgnored) {
    logger.debug("Path ignored by config", {
      operation: "shouldIgnorePath",
      path,
      matchedPattern: config.ignorePaths.find((p) =>
        pathMatchesPattern(path, p),
      ),
    });
  }

  return isIgnored;
}

/**
 * Checks if a transformer condition is met for a given proposal
 */
function checkCondition(
  condition: TransformerCondition,
  proposal: any,
): boolean {
  const value = getValueAtPath(proposal, condition.path);

  // Check exists condition
  if (condition.exists !== undefined) {
    const exists = hasValueAtPath(proposal, condition.path);
    if (condition.exists !== exists) return false;
  }

  // Check equals condition
  if (condition.equals !== undefined) {
    const allowedValues = Array.isArray(condition.equals)
      ? condition.equals
      : [condition.equals];
    if (!allowedValues.includes(value)) return false;
  }

  // Check notEquals condition
  if (condition.notEquals !== undefined) {
    const forbiddenValues = Array.isArray(condition.notEquals)
      ? condition.notEquals
      : [condition.notEquals];
    if (forbiddenValues.includes(value)) return false;
  }

  return true;
}

/**
 * Checks if all transformer conditions are met
 */
function shouldApplyTransformer(
  config: TransformerConfig,
  proposal: any,
): boolean {
  if (!config.when) return true; // No conditions = always apply

  const conditions = Array.isArray(config.when) ? config.when : [config.when];

  // All conditions must be met (AND logic)
  return conditions.every((condition) => checkCondition(condition, proposal));
}

/**
 * Converts a strategy to explicit configuration
 */
function strategyToConfig(
  strategy: TransformerStrategy,
): Pick<TransformerConfig, "onMissing" | "onExisting" | "applyTo"> {
  switch (strategy) {
    case TransformerStrategy.AddMissingOnly:
      return {
        onMissing: "add",
        onExisting: "skip",
        applyTo: "expected",
      };
    case TransformerStrategy.TransformAlways:
      return {
        onMissing: "skip",
        onExisting: "transform",
        applyTo: "both",
      };
    case TransformerStrategy.TransformExisting:
      return {
        onMissing: "skip",
        onExisting: "transform",
        applyTo: "both",
      };
  }
}

/**
 * Normalizes a transformer to TransformerConfig format
 */
function normalizeTransformer(
  transformer:
    | ((value: unknown, context?: TransformerContext) => unknown)
    | TransformerConfig,
): TransformerConfig {
  if (typeof transformer === "function") {
    return {
      transform: transformer,
      onMissing: "skip",
      applyTo: "both",
      onExisting: "transform",
    };
  }

  // If strategy is specified, use it to set the config
  if (transformer.strategy) {
    const strategyConfig = strategyToConfig(transformer.strategy);
    return {
      transform: transformer.transform,
      ...strategyConfig,
      // Allow explicit overrides even with strategy
      ...transformer,
    };
  }

  // Default values for legacy config
  return {
    onExisting: "transform",
    onMissing: "skip",
    applyTo: "both",
    ...transformer,
  };
}

/**
 * Gets the transformer config for a path if one exists
 */
export function getPathTransformer(
  path: string,
  config: ValidationConfig,
): TransformerConfig | undefined {
  if (!config.transformers) return undefined;

  if (config.transformers[path]) {
    return normalizeTransformer(config.transformers[path]);
  }

  for (const [pattern, transformer] of Object.entries(config.transformers)) {
    if (pathMatchesPattern(path, pattern)) {
      return normalizeTransformer(transformer);
    }
  }

  return undefined;
}

/**
 * Applies normalization configuration to extract fields from a proposal
 */
export function normalizeWithConfig(
  proposal: any,
  config: ValidationConfig,
): any {
  if (!config.normalization || config.normalization.length === 0) {
    logger.debug("No normalization config, returning proposal as-is", {
      operation: "normalizeWithConfig.skip",
      changeType: proposal.changeType,
    });
    return proposal;
  }

  let normConfig: NormalizationConfig | undefined;

  for (const nc of config.normalization) {
    if (!nc.when) {
      normConfig = nc;
    } else if (proposal.changeType === nc.when) {
      normConfig = nc;
      break;
    }
  }

  if (!normConfig) {
    logger.warn("No normalization config found for proposal", {
      operation: "normalizeWithConfig.noMatch",
      changeType: proposal.changeType,
      availableConfigs: config.normalization.map((nc) => nc.when || "default"),
    });
    return proposal;
  }

  logger.debug("Applying normalization", {
    operation: "normalizeWithConfig.start",
    changeType: proposal.changeType,
    configType: normConfig.when || "default",
    fieldCount: Object.keys(normConfig.fields).length,
  });

  const normalized: any = {};
  const extractedFields: string[] = [];

  for (const [targetField, extractorConfig] of Object.entries(
    normConfig.fields,
  )) {
    let value: any;

    if (typeof extractorConfig === "string") {
      if (extractorConfig === "__literal__") {
        value = normConfig.when;
      } else if (extractorConfig === "__self__") {
        value = proposal;
      } else {
        value = getValueAtPath(proposal, extractorConfig);
      }
    } else {
      if (extractorConfig.from === "__literal__") {
        value = extractorConfig.defaultValue ?? normConfig.when;
      } else if (extractorConfig.from === "__self__") {
        value = proposal;
      } else {
        value = getValueAtPath(proposal, extractorConfig.from);
      }

      if (value === undefined && extractorConfig.defaultValue !== undefined) {
        value = extractorConfig.defaultValue;
      }

      if (extractorConfig.transform && value !== undefined) {
        value = extractorConfig.transform(value);
      }
    }

    if (value !== undefined) {
      normalized[targetField] = value;
      extractedFields.push(targetField);
    }
  }

  logger.debug("Normalization complete", {
    operation: "normalizeWithConfig.complete",
    originalKeys: Object.keys(proposal),
    normalizedKeys: extractedFields,
    changeType: normalized.changeType,
  });

  return normalized;
}

/**
 * Applies transformers that add missing fields to proposals
 * This is similar to the old substituteSituationAwareExpectedValues
 * 
 * @param proposals - The proposals to transform
 * @param config - Validation configuration with transformers
 * @param isExpected - Whether these are expected proposals (true) or actual (false)
 * @param pairedProposals - Optional paired proposals for condition checking
 *                          If transforming expected, these should be actual proposals
 *                          If transforming actual, these should be expected proposals
 */
export function applyAddTransformers(
  proposals: any[],
  config: ValidationConfig,
  isExpected: boolean = true,
  pairedProposals?: any[],
): any[] {
  if (!config.transformers) return proposals;

  const transformerPaths = Object.keys(config.transformers).filter((path) => {
    const tc = normalizeTransformer(config.transformers![path]);
    return tc.onMissing === "add";
  });

  if (transformerPaths.length > 0) {
    logger.debug("Applying add transformers", {
      operation: "applyAddTransformers",
      side: isExpected ? "expected" : "actual",
      paths: transformerPaths,
      proposalCount: proposals.length,
      hasPairedProposals: !!pairedProposals,
    });
  }

  return proposals.map((proposal, index) => {
    const modified = deepClone(proposal);
    let fieldsAdded = 0;

    // Get paired proposal if available
    const pairedProposal = pairedProposals?.[index];

    for (const [path, transformer] of Object.entries(config.transformers)) {
      const transformerConfig = normalizeTransformer(transformer);

      if (transformerConfig.onMissing !== "add") continue;

      const side = isExpected ? "expected" : "actual";
      if (
        transformerConfig.applyTo !== "both" &&
        transformerConfig.applyTo !== side
      ) {
        continue;
      }

      // Determine which proposal to check conditions against
      let proposalForCondition = modified;
      const conditionTarget = transformerConfig.conditionTarget || "self";
      
      if (conditionTarget === "actual" && isExpected && pairedProposal) {
        // We're transforming expected, but want to check condition on actual
        proposalForCondition = pairedProposal;
      } else if (conditionTarget === "expected" && !isExpected && pairedProposal) {
        // We're transforming actual, but want to check condition on expected
        proposalForCondition = pairedProposal;
      } else if (conditionTarget !== "self" && !pairedProposal) {
        logger.debug("Cannot check condition on paired proposal - not provided", {
          operation: "applyAddTransformers.noPairedProposal",
          proposalIndex: index,
          path,
          conditionTarget,
          side,
        });
        continue;
      }

      // Check if transformer conditions are met
      if (!shouldApplyTransformer(transformerConfig, proposalForCondition)) {
        logger.debug("Skipping transformer due to condition not met", {
          operation: "applyAddTransformers.conditionNotMet",
          proposalIndex: index,
          path,
          when: transformerConfig.when,
          conditionTarget,
          changeType: proposalForCondition.changeType,
        });
        continue;
      }

      const exists = hasValueAtPath(modified, path);

      if (!exists) {
        // Check if this proposal has ignorePaths that would ignore this field
        const proposalIgnorePaths = modified.ignorePaths;
        if (proposalIgnorePaths) {
          const pathsToCheck = Array.isArray(proposalIgnorePaths)
            ? proposalIgnorePaths
            : [proposalIgnorePaths];

          const shouldSkip = pathsToCheck.some((ignorePath) =>
            pathMatchesPattern(path, ignorePath),
          );

          if (shouldSkip) {
            logger.debug("Skipping transformer for ignored path", {
              operation: "applyAddTransformers.skipIgnored",
              proposalIndex: index,
              path,
              ignorePaths: pathsToCheck,
            });
            continue;
          }
        }

        const context: TransformerContext = {
          path,
          isExpected,
          currentDate: new Date(),
        };

        const transformedValue = transformerConfig.transform(
          undefined,
          context,
        );
        setValueAtPath(modified, path, transformedValue);
        fieldsAdded++;

        logger.debug("Added missing field", {
          operation: "applyAddTransformers.addField",
          proposalIndex: index,
          path,
          value: transformedValue,
          conditionCheckedOn: conditionTarget,
        });
      }
    }

    if (fieldsAdded > 0) {
      logger.debug("Transformer summary for proposal", {
        operation: "applyAddTransformers.summary",
        proposalIndex: index,
        fieldsAdded,
        changeType: modified.changeType,
      });
    }

    return modified;
  });
}

export function applyTransformer(
  value: any,
  path: string,
  config: ValidationConfig,
  isExpected: boolean,
  currentDate?: Date,
): { value: any; wasAdded: boolean } {
  const transformerConfig = getPathTransformer(path, config);
  if (!transformerConfig) {
    return { value, wasAdded: false };
  }

  const side = isExpected ? "expected" : "actual";
  if (
    transformerConfig.applyTo !== "both" &&
    transformerConfig.applyTo !== side
  ) {
    return { value, wasAdded: false };
  }

  const context: TransformerContext = {
    path,
    isExpected,
    currentDate,
  };

  try {
    if (value === undefined || value === null) {
      if (transformerConfig.onMissing === "add") {
        return {
          value: transformerConfig.transform(undefined, context),
          wasAdded: true,
        };
      } else if (transformerConfig.onMissing === "fail") {
        throw new Error(`Required field missing: ${path}`);
      }
      return { value, wasAdded: false };
    }

    // Check if we should transform existing values
    if (transformerConfig.onExisting === "skip") {
      return { value, wasAdded: false };
    }

    return {
      value: transformerConfig.transform(value, context),
      wasAdded: false,
    };
  } catch (error) {
    logger.warn("Failed to apply transformer", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return { value, wasAdded: false };
  }
}
