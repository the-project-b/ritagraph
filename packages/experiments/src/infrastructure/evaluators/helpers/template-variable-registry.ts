/**
 * Context provided to template variables for evaluation
 */
export interface TemplateContext {
  currentDate: Date;
  locale?: string;
  timezone?: string;
}

/**
 * Result of evaluating a template variable with optional arithmetic
 */
export interface TemplateEvaluationResult {
  displayValue: string;
  dataValue: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Defines a template variable that can be used in input questions and transformers
 */
export interface TemplateVariable {
  key: string;
  description: string;
  evaluate: (context: TemplateContext) => TemplateEvaluationResult;
  supportsArithmetic?: boolean;
  applyArithmetic?: (
    baseResult: TemplateEvaluationResult,
    operator: "+" | "-",
    operand: number,
    context: TemplateContext,
  ) => TemplateEvaluationResult;
}

/**
 * Get month name with optional year when crossing year boundaries
 */
function formatMonthWithSmartYear(date: Date, currentDate: Date): string {
  const monthName = date.toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  if (date.getUTCFullYear() !== currentDate.getUTCFullYear()) {
    return `${monthName} ${date.getUTCFullYear()}`;
  }

  return monthName;
}

/**
 * Convert date to UTC midnight ISO string for data fields
 */
function toUtcMidnightIsoString(date: Date): string {
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth();
  const utcDay = date.getUTCDate();

  return new Date(
    Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0),
  ).toISOString();
}

/**
 * Predefined template variables for date/time operations
 */
const TEMPLATE_VARIABLE_DEFINITIONS: TemplateVariable[] = [
  {
    key: "currentMonth",
    description: "Current month name with arithmetic support",
    evaluate: (context) => {
      const date = context.currentDate;
      return {
        displayValue: formatMonthWithSmartYear(date, context.currentDate),
        dataValue: toUtcMidnightIsoString(
          new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
        ),
      };
    },
    supportsArithmetic: true,
    applyArithmetic: (baseResult, operator, operand, context) => {
      const currentDate = context.currentDate;
      const months = operator === "+" ? operand : -operand;
      const targetDate = new Date(
        Date.UTC(
          currentDate.getUTCFullYear(),
          currentDate.getUTCMonth() + months,
          1,
        ),
      );

      return {
        displayValue: formatMonthWithSmartYear(targetDate, currentDate),
        dataValue: toUtcMidnightIsoString(targetDate),
      };
    },
  },
  {
    key: "currentYear",
    description: "Current year",
    evaluate: (context) => {
      const year = context.currentDate.getUTCFullYear();
      return {
        displayValue: String(year),
        dataValue: year,
      };
    },
    supportsArithmetic: true,
    applyArithmetic: (baseResult, operator, operand, context) => {
      const currentYear = context.currentDate.getUTCFullYear();
      const years = operator === "+" ? operand : -operand;
      const targetYear = currentYear + years;

      return {
        displayValue: String(targetYear),
        dataValue: targetYear,
      };
    },
  },
  {
    key: "currentDay",
    description: "Current day of month",
    evaluate: (context) => {
      const date = context.currentDate;
      const day = date.getUTCDate();
      return {
        displayValue: String(day),
        dataValue: toUtcMidnightIsoString(date),
      };
    },
    supportsArithmetic: true,
    applyArithmetic: (baseResult, operator, operand, context) => {
      const currentDate = context.currentDate;
      const days = operator === "+" ? operand : -operand;
      const targetDate = new Date(
        Date.UTC(
          currentDate.getUTCFullYear(),
          currentDate.getUTCMonth(),
          currentDate.getUTCDate() + days,
        ),
      );

      return {
        displayValue: targetDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year:
            targetDate.getUTCFullYear() !== currentDate.getUTCFullYear()
              ? "numeric"
              : undefined,
          timeZone: "UTC",
        }),
        dataValue: toUtcMidnightIsoString(targetDate),
      };
    },
  },
  {
    key: "today",
    description: "Today's date in ISO format",
    evaluate: (context) => {
      const isoString = toUtcMidnightIsoString(context.currentDate);
      return {
        displayValue: context.currentDate.toLocaleDateString("en-US", {
          timeZone: "UTC",
        }),
        dataValue: isoString,
      };
    },
    supportsArithmetic: false,
  },
];

/**
 * Registry for template variables used in input questions and transformers
 */
export class TemplateVariableRegistry {
  private static variables = new Map<string, TemplateVariable>(
    TEMPLATE_VARIABLE_DEFINITIONS.map((v) => [v.key, v]),
  );

  /**
   * Get a template variable by key
   */
  static get(key: string): TemplateVariable | undefined {
    return this.variables.get(key);
  }

  /**
   * Check if a template variable exists
   */
  static has(key: string): boolean {
    return this.variables.has(key);
  }

  /**
   * Get all registered template variable keys
   */
  static getKeys(): string[] {
    return Array.from(this.variables.keys());
  }

  /**
   * Register a new template variable
   */
  static register(variable: TemplateVariable): void {
    this.variables.set(variable.key, variable);
  }

  /**
   * Evaluate a template expression like "currentMonth+3"
   */
  static evaluateExpression(
    expression: string,
    context: TemplateContext,
  ): TemplateEvaluationResult | null {
    const arithmeticMatch = expression.match(/^(\w+)([+-])(\d+)$/);

    if (arithmeticMatch) {
      const [_, variableKey, operator, operandStr] = arithmeticMatch;
      const variable = this.get(variableKey);

      if (
        !variable ||
        !variable.supportsArithmetic ||
        !variable.applyArithmetic
      ) {
        return null;
      }

      const baseResult = variable.evaluate(context);
      const operand = parseInt(operandStr, 10);

      return variable.applyArithmetic(
        baseResult,
        operator as "+" | "-",
        operand,
        context,
      );
    }

    const variable = this.get(expression);
    if (!variable) {
      return null;
    }

    return variable.evaluate(context);
  }
}
