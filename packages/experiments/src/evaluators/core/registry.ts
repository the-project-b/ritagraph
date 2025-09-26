import type { Evaluator, EvaluatorMap } from "./types.js";

/**
 * Central registry for all evaluators
 */
export class EvaluatorRegistry {
  private static instance: EvaluatorRegistry;
  private readonly evaluators: Map<string, Evaluator> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): EvaluatorRegistry {
    if (!EvaluatorRegistry.instance) {
      EvaluatorRegistry.instance = new EvaluatorRegistry();
    }
    return EvaluatorRegistry.instance;
  }

  /**
   * Register an evaluator
   */
  public register(evaluator: Evaluator): void {
    const type = evaluator.config.type;
    if (this.evaluators.has(type)) {
      throw new Error(`Evaluator with type "${type}" is already registered`);
    }
    this.evaluators.set(type, evaluator);
  }

  /**
   * Get an evaluator by type
   */
  public get(type: string): Evaluator | undefined {
    return this.evaluators.get(type);
  }

  /**
   * Get all registered evaluators
   */
  public getAll(): EvaluatorMap {
    return new Map(this.evaluators);
  }

  /**
   * Check if an evaluator is registered
   */
  public has(type: string): boolean {
    return this.evaluators.has(type);
  }

  /**
   * List all registered evaluator types
   */
  public listTypes(): string[] {
    return Array.from(this.evaluators.keys());
  }

  /**
   * Clear all registered evaluators (mainly for testing)
   */
  public clear(): void {
    this.evaluators.clear();
  }
}
