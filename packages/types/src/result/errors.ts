/**
 * Base error class with additional context
 */
export abstract class BaseError extends Error {
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    public readonly code: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Domain errors - business logic violations
 */
export class ValidationError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", context);
  }
}

export class NotFoundError extends BaseError {
  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string | undefined,
    context?: Record<string, unknown>,
  ) {
    const id = resourceId ? ` with id ${resourceId}` : "";
    super(`${resourceType}${id} not found`, "NOT_FOUND", context);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "CONFLICT", context);
  }
}

export class UnauthorizedError extends BaseError {
  constructor(
    message: string = "Unauthorized",
    context?: Record<string, unknown>,
  ) {
    super(message, "UNAUTHORIZED", context);
  }
}

export class ForbiddenError extends BaseError {
  constructor(
    message: string = "Forbidden",
    public readonly requiredPermissions?: string[],
    context?: Record<string, unknown>,
  ) {
    super(message, "FORBIDDEN", { ...context, requiredPermissions });
  }
}

/**
 * Application errors - use case and service layer errors
 */
export class ApplicationError extends BaseError {
  constructor(
    message: string,
    code: string = "APPLICATION_ERROR",
    context?: Record<string, unknown>,
  ) {
    super(message, code, context);
  }
}

export class BusinessRuleViolationError extends ApplicationError {
  constructor(
    public readonly rule: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message, "BUSINESS_RULE_VIOLATION", { ...context, rule });
  }
}

export class ConcurrencyError extends ApplicationError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "CONCURRENCY_ERROR", context);
  }
}

export class RateLimitError extends ApplicationError {
  constructor(
    public readonly limit: number,
    public readonly window: string,
    public readonly retryAfter?: Date,
    context?: Record<string, unknown>,
  ) {
    super(
      `Rate limit exceeded: ${limit} requests per ${window}`,
      "RATE_LIMIT",
      { ...context, limit, window, retryAfter },
    );
  }
}

/**
 * Infrastructure errors - external service and persistence errors
 */
export class InfrastructureError extends BaseError {
  constructor(
    message: string,
    code: string = "INFRASTRUCTURE_ERROR",
    context?: Record<string, unknown>,
  ) {
    super(message, code, context);
  }
}

export class PersistenceError extends InfrastructureError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "PERSISTENCE_ERROR", context);
  }
}

export class ExternalServiceError extends InfrastructureError {
  constructor(
    public readonly service: string,
    message: string,
    public readonly statusCode?: number,
    context?: Record<string, unknown>,
  ) {
    super(message, "EXTERNAL_SERVICE_ERROR", {
      ...context,
      service,
      statusCode,
    });
  }
}

export class NetworkError extends InfrastructureError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "NETWORK_ERROR", context);
  }
}

export class TimeoutError extends InfrastructureError {
  constructor(
    public readonly timeout: number,
    public readonly operation: string,
    context?: Record<string, unknown>,
  ) {
    super(`Operation ${operation} timed out after ${timeout}ms`, "TIMEOUT", {
      ...context,
      timeout,
      operation,
    });
  }
}

/**
 * Error utilities
 */
export const isBaseError = (error: unknown): error is BaseError => {
  return error instanceof BaseError;
};

export const isDomainError = (
  error: unknown,
): error is ValidationError | NotFoundError | ConflictError => {
  return (
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError
  );
};

export const isApplicationError = (
  error: unknown,
): error is ApplicationError => {
  return error instanceof ApplicationError;
};

export const isInfrastructureError = (
  error: unknown,
): error is InfrastructureError => {
  return error instanceof InfrastructureError;
};

/**
 * Error factory for creating typed errors
 */
export class ErrorFactory {
  static validation(
    message: string,
    field?: string,
    value?: unknown,
  ): ValidationError {
    return new ValidationError(message, { field, value });
  }

  static notFound(resourceType: string, id?: string): NotFoundError {
    return new NotFoundError(resourceType, id);
  }

  static conflict(message: string, existingId?: string): ConflictError {
    return new ConflictError(message, { existingId });
  }

  static unauthorized(reason?: string): UnauthorizedError {
    return new UnauthorizedError(reason);
  }

  static forbidden(
    reason?: string,
    requiredPermissions?: string[],
  ): ForbiddenError {
    return new ForbiddenError(reason, requiredPermissions);
  }

  static businessRule(
    rule: string,
    message: string,
  ): BusinessRuleViolationError {
    return new BusinessRuleViolationError(rule, message);
  }

  static external(
    service: string,
    message: string,
    statusCode?: number,
  ): ExternalServiceError {
    return new ExternalServiceError(service, message, statusCode);
  }

  static timeout(operation: string, timeout: number): TimeoutError {
    return new TimeoutError(timeout, operation);
  }
}
