import { EvaluatorRegistry } from "./registry.js";
import type { EvaluationOptions, Evaluator, EvaluatorConfig } from "./types.js";

/**
 * Factory for creating evaluator instances
 */
export class EvaluatorFactory {
  private readonly registry = EvaluatorRegistry.getInstance();

  /**
   * Create an evaluator by type
   */
  public create(
    type: string,
    options?: EvaluationOptions,
  ): Evaluator | undefined {
    const evaluator = this.registry.get(type);

    if (!evaluator) {
      return undefined;
    }

    // If we need to customize the evaluator with options,
    // we can wrap it here. For now, just return the registered instance
    return evaluator;
  }

  /**
   * Create multiple evaluators
   */
  public createMany(types: string[], options?: EvaluationOptions): Evaluator[] {
    return types
      .map((type) => this.create(type, options))
      .filter((e): e is Evaluator => e !== undefined);
  }

  /**
   * Get evaluator configuration
   */
  public getConfig(type: string): EvaluatorConfig | undefined {
    const evaluator = this.registry.get(type);
    return evaluator?.config;
  }

  /**
   * List all available evaluator types
   */
  public listAvailable(): string[] {
    return this.registry.listTypes();
  }

  /**
   * Check if an evaluator type is available
   */
  public isAvailable(type: string): boolean {
    return this.registry.has(type);
  }
}
