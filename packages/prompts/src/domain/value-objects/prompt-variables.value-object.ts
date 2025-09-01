import { Result } from "../../shared/types/result.js";
import { ValidationError } from "../../shared/errors/domain.errors.js";

/**
 * Represents a single variable definition with type and validation rules.
 */
export interface VariableDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  validator?: (value: unknown) => boolean;
}

/**
 * Immutable value object representing prompt variable definitions.
 * Defines expected variables with types and validation rules.
 */
export class PromptVariables {
  private readonly variables: Map<string, VariableDefinition>;

  private constructor(definitions: VariableDefinition[]) {
    this.variables = new Map(definitions.map((def) => [def.name, def]));
  }

  // #region Factory Methods
  /**
   * Creates PromptVariables from an array of definitions.
   * @param definitions - Array of variable definitions
   * @returns Result<PromptVariables, ValidationError> - Success with variables or validation error
   */
  static create(
    definitions: VariableDefinition[],
  ): Result<PromptVariables, ValidationError> {
    if (!Array.isArray(definitions)) {
      return Result.failure(
        new ValidationError(
          "Variable definitions must be an array",
          "definitions",
        ),
      );
    }

    const names = new Set<string>();
    for (const def of definitions) {
      const validationResult = PromptVariables.validateDefinition(def);
      if (Result.isFailure(validationResult)) {
        return validationResult as Result<never, ValidationError>;
      }

      if (names.has(def.name)) {
        return Result.failure(
          new ValidationError(
            `Duplicate variable name: ${def.name}`,
            "definitions",
          ),
        );
      }
      names.add(def.name);
    }

    return Result.success(new PromptVariables(definitions));
  }

  /**
   * Creates an empty PromptVariables instance.
   * @returns PromptVariables - Empty variables instance
   */
  static empty(): PromptVariables {
    return new PromptVariables([]);
  }

  /**
   * Validates a single variable definition.
   * @param def - The definition to validate
   * @returns Result<void, ValidationError> - Success or validation error
   */
  private static validateDefinition(
    def: VariableDefinition,
  ): Result<void, ValidationError> {
    if (!def.name || typeof def.name !== "string") {
      return Result.failure(
        new ValidationError("Variable name must be a non-empty string", "name"),
      );
    }

    const validTypes = ["string", "number", "boolean", "array", "object"];
    if (!validTypes.includes(def.type)) {
      return Result.failure(
        new ValidationError(`Invalid variable type: ${def.type}`, "type"),
      );
    }

    if (typeof def.required !== "boolean") {
      return Result.failure(
        new ValidationError(
          "Variable 'required' must be a boolean",
          "required",
        ),
      );
    }

    return Result.success(void 0);
  }
  // #endregion

  // #region Validation
  /**
   * Validates provided values against variable definitions.
   * @param values - The values to validate
   * @returns Result<Record<string, unknown>, ValidationError> - Validated values or error
   */
  validate(
    values: Record<string, unknown>,
  ): Result<Record<string, unknown>, ValidationError> {
    const validated: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const [name, def] of this.variables) {
      const value = values[name];

      if (value === undefined) {
        if (def.required && def.defaultValue === undefined) {
          errors.push(`Missing required variable: ${name}`);
          continue;
        }
        validated[name] = def.defaultValue;
        continue;
      }

      if (!this.validateType(value, def.type)) {
        errors.push(`Variable '${name}' must be of type ${def.type}`);
        continue;
      }

      if (def.validator && !def.validator(value)) {
        errors.push(`Variable '${name}' failed custom validation`);
        continue;
      }

      validated[name] = value;
    }

    if (errors.length > 0) {
      return Result.failure(
        new ValidationError(errors.join("; "), "variables"),
      );
    }

    for (const key in values) {
      if (!this.variables.has(key)) {
        validated[key] = values[key];
      }
    }

    return Result.success(validated);
  }

  /**
   * Validates that a value matches the expected type.
   * @param value - The value to check
   * @param type - The expected type
   * @returns boolean - True if type matches
   */
  private validateType(
    value: unknown,
    type: VariableDefinition["type"],
  ): boolean {
    switch (type) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && !isNaN(value);
      case "boolean":
        return typeof value === "boolean";
      case "array":
        return Array.isArray(value);
      case "object":
        return (
          typeof value === "object" && value !== null && !Array.isArray(value)
        );
      default:
        return false;
    }
  }
  // #endregion

  // #region Getters
  /**
   * Gets a variable definition by name.
   * @param name - The variable name
   * @returns VariableDefinition | undefined - The definition or undefined if not found
   */
  getVariable(name: string): VariableDefinition | undefined {
    return this.variables.get(name);
  }

  /**
   * Gets all variable names.
   * @returns string[] - Array of variable names
   */
  getNames(): string[] {
    return Array.from(this.variables.keys());
  }

  /**
   * Gets all required variable names.
   * @returns string[] - Array of required variable names
   */
  getRequiredNames(): string[] {
    return Array.from(this.variables.values())
      .filter((def) => def.required && def.defaultValue === undefined)
      .map((def) => def.name);
  }

  /**
   * Checks if a variable is defined.
   * @param name - The variable name to check
   * @returns boolean - True if variable is defined
   */
  hasVariable(name: string): boolean {
    return this.variables.has(name);
  }

  /**
   * Gets the number of defined variables.
   * @returns number - The count of variables
   */
  size(): number {
    return this.variables.size;
  }

  /**
   * Checks if there are no variables defined.
   * @returns boolean - True if no variables are defined
   */
  isEmpty(): boolean {
    return this.variables.size === 0;
  }
  // #endregion

  // #region Merging
  /**
   * Merges with another PromptVariables instance.
   * @param other - The other variables to merge
   * @returns Result<PromptVariables, ValidationError> - Merged variables or error on conflicts
   */
  merge(other: PromptVariables): Result<PromptVariables, ValidationError> {
    const allDefinitions: VariableDefinition[] = [];
    const names = new Set<string>();

    for (const def of this.variables.values()) {
      allDefinitions.push(def);
      names.add(def.name);
    }

    for (const def of other.variables.values()) {
      if (names.has(def.name)) {
        const existing = this.variables.get(def.name);
        if (existing && existing.type !== def.type) {
          return Result.failure(
            new ValidationError(
              `Conflicting types for variable '${def.name}': ${existing.type} vs ${def.type}`,
              "merge",
            ),
          );
        }
      } else {
        allDefinitions.push(def);
      }
    }

    return PromptVariables.create(allDefinitions);
  }
  // #endregion
}
