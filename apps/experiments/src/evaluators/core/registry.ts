import { Evaluator, EvaluatorMap } from './types.js';
import { expectedOutputEvaluator } from '../implementations/expected-output.evaluator.js';
import { languageVerificationEvaluator } from '../implementations/language-verification.evaluator.js';
import { dataChangeProposalEvaluator } from '../implementations/data-change-proposal.evaluator.js';

export class EvaluatorRegistry {
  private static readonly evaluators = new Map<string, Evaluator>();
  
  static {
    // Register all evaluators
    this.register(expectedOutputEvaluator);
    this.register(languageVerificationEvaluator);
    this.register(dataChangeProposalEvaluator);
  }
  
  /**
   * Register a new evaluator in the registry
   */
  static register<T extends Evaluator<any, any, any>>(evaluator: T): void {
    const { type } = evaluator.config;
    
    if (this.evaluators.has(type)) {
      throw new Error(`Evaluator type '${type}' is already registered`);
    }
    
    // Type erasure for storage - we lose specific typing in the registry
    // but maintain it at the implementation level
    this.evaluators.set(type, evaluator as Evaluator);
  }
  
  /**
   * Get a specific evaluator by type
   */
  static get(type: string): Evaluator {
    const evaluator = this.evaluators.get(type);
    if (!evaluator) {
      const availableTypes = this.getTypes().join(', ');
      throw new Error(
        `Unknown evaluator type: '${type}'. Available types: ${availableTypes}`
      );
    }
    return evaluator;
  }
  
  /**
   * Get all registered evaluators
   */
  static getAll(): readonly Evaluator[] {
    return Array.from(this.evaluators.values());
  }
  
  /**
   * Get all registered evaluator types
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
   * Get the internal map (readonly)
   */
  static getMap(): EvaluatorMap {
    return this.evaluators as EvaluatorMap;
  }
  
  /**
   * Clear all registered evaluators (primarily for testing)
   */
  static clear(): void {
    this.evaluators.clear();
  }
}