import { EvaluatorRegistry } from './registry';
import { 
  EvaluatorInfo, 
  EvaluationOptions,
  EvaluatorParams,
  EvaluatorResult,
  ModelIdentifier 
} from './types';

// Dynamically generate evaluator type from registry
export type EvaluatorType = ReturnType<typeof EvaluatorRegistry.getTypes>[number];

// Type for the evaluator function returned by createEvaluator
export type EvaluatorFunction = (params: EvaluatorParams) => Promise<EvaluatorResult>;

// Export evaluator metadata for richer information
export const EVALUATOR_INFO: Readonly<Record<string, EvaluatorInfo>> = Object.freeze(
  EvaluatorRegistry.getAll().reduce(
    (acc, evaluator) => {
      const { config } = evaluator;
      acc[config.type] = Object.freeze({
        type: config.type,
        name: config.name,
        description: config.description,
        defaultModel: config.defaultModel,
        supportsCustomPrompt: config.supportsCustomPrompt,
        supportsReferenceKey: config.supportsReferenceKey,
      });
      return acc;
    },
    {} as Record<string, EvaluatorInfo>
  )
);

/**
 * Create an evaluator function with bound configuration
 */
export function createEvaluator(
  type: string,
  customPrompt?: string,
  model?: ModelIdentifier,
  referenceKey?: string,
): EvaluatorFunction {
  // Validate evaluator exists
  if (!EvaluatorRegistry.has(type)) {
    const availableTypes = EvaluatorRegistry.getTypes().join(', ');
    throw new Error(
      `Cannot create evaluator for unknown type: '${type}'. Available types: ${availableTypes}`
    );
  }

  const evaluator = EvaluatorRegistry.get(type);
  
  // Build options object with proper typing
  const options: EvaluationOptions = Object.freeze({
    ...(customPrompt && { customPrompt }),
    ...(model && { model }),
    ...(referenceKey && { referenceKey }),
  });
  
  // Return a strongly typed evaluator function
  return async (params: EvaluatorParams): Promise<EvaluatorResult> => {
    // Validate required parameters - allow evaluation of failed runs
    if (!params.inputs) {
      throw new Error('Evaluator params must include inputs');
    }
    
    // If outputs is missing (e.g., run failed), return a default evaluation
    if (!params.outputs) {
      console.warn(`[Evaluator ${type}] Run has no outputs, likely failed. Returning default evaluation.`);
      return {
        key: type.toLowerCase(),
        score: 0,
        comment: 'Run failed - no outputs available for evaluation',
        metadata: { 
          reason: 'missing_outputs',
          evaluator_type: type 
        },
      };
    }
    
    return evaluator.evaluate(params, options);
  };
}

/**
 * Get information about all available evaluators
 */
export function getAvailableEvaluators(): readonly EvaluatorInfo[] {
  return Object.values(EVALUATOR_INFO);
}

/**
 * Get information about a specific evaluator
 */
export function getEvaluatorInfo(type: string): EvaluatorInfo | undefined {
  return EVALUATOR_INFO[type];
}

/**
 * Check if an evaluator type is available
 */
export function isEvaluatorAvailable(type: string): boolean {
  return EvaluatorRegistry.has(type);
}