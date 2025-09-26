// Core types and interfaces
export { EvaluatorFactory } from "./core/factory.js";
export { EvaluatorRegistry } from "./core/registry.js";
export * from "./core/types.js";

// Evaluator implementations
export { ExpectedOutputEvaluator } from "./implementations/expected-output.evaluator.js";

// Register default evaluators
import { EvaluatorRegistry } from "./core/registry.js";
import { ExpectedOutputEvaluator } from "./implementations/expected-output.evaluator.js";

// Auto-register built-in evaluators
const registry = EvaluatorRegistry.getInstance();
registry.register(new ExpectedOutputEvaluator());
