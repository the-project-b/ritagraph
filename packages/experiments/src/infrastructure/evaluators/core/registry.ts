import {
  expectedOutputEvaluator,
  languageVerificationEvaluator,
  dataChangeProposalEvaluator,
  titleGenerationEvaluator,
  proposalQuoteVerificationEvaluator,
} from "../implementations/index.js";

/**
 * Union type of all our evaluators for strong typing
 */
type RegisteredEvaluator =
  | typeof expectedOutputEvaluator
  | typeof languageVerificationEvaluator
  | typeof dataChangeProposalEvaluator
  | typeof titleGenerationEvaluator
  | typeof proposalQuoteVerificationEvaluator;

/**
 * Central registry for all evaluators
 * Single source of truth for available evaluators
 */
export class EvaluatorRegistry {
  private static evaluators = new Map<string, RegisteredEvaluator>();

  static {
    // Register all evaluators on module load
    this.register(expectedOutputEvaluator);
    this.register(languageVerificationEvaluator);
    this.register(dataChangeProposalEvaluator);
    this.register(titleGenerationEvaluator);
    this.register(proposalQuoteVerificationEvaluator);
  }

  /**
   * Register an evaluator
   */
  static register(evaluator: RegisteredEvaluator): void {
    this.evaluators.set(evaluator.config.type, evaluator);
  }

  /**
   * Get an evaluator by type
   */
  static get(type: string): RegisteredEvaluator | undefined {
    return this.evaluators.get(type);
  }

  /**
   * Get all registered evaluators
   */
  static getAll(): readonly RegisteredEvaluator[] {
    return Array.from(this.evaluators.values());
  }

  /**
   * Get all evaluator types
   */
  static getTypes(): readonly string[] {
    return Array.from(this.evaluators.keys());
  }

  /**
   * Check if an evaluator type is registered
   */
  static has(type: string): boolean {
    return this.evaluators.has(type);
  }

  /**
   * Get evaluator info for GraphQL schema
   */
  static getEvaluatorInfo() {
    return this.getAll().map((evaluator) => ({
      type: evaluator.config.type,
      name: evaluator.config.name,
      description: evaluator.config.description,
      supportsCustomPrompt: evaluator.config.supportsCustomPrompt,
      supportsReferenceKey: evaluator.config.supportsReferenceKey,
      defaultModel: evaluator.config.defaultModel,
    }));
  }
}

/**
 * Singleton instance for convenience
 */
export const evaluatorRegistry = EvaluatorRegistry;
