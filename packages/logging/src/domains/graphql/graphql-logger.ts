import type { Logger } from "../../core/logger.js";
import {
  GraphQLLogLevel,
  type LoggingConfig,
  type GraphQLLogContext,
} from "../../core/types.js";
import { redactSensitive } from "../../utils/redaction.js";
import { shouldSample } from "../../utils/sampling.js";

/**
 * GraphQL-specific logging utility
 */
export class GraphQLLogger {
  constructor(
    private logger: Logger,
    private config: LoggingConfig,
  ) {}

  /**
   * Log a GraphQL operation
   */
  logOperation(context: GraphQLLogContext): void {
    if (this.config.graphql === GraphQLLogLevel.OFF) {
      return;
    }

    // Apply sampling rate
    if (!shouldSample(this.config.sampleRate)) {
      return;
    }

    const sanitizedContext = this.sanitizeContext(context);

    if (this.config.graphql === GraphQLLogLevel.SIMPLE) {
      this.logSimple(sanitizedContext);
    } else if (this.config.graphql === GraphQLLogLevel.VERBOSE) {
      this.logVerbose(sanitizedContext);
    }
  }

  /**
   * Sanitize sensitive data from context
   */
  private sanitizeContext(context: GraphQLLogContext): GraphQLLogContext {
    return {
      ...context,
      variables: context.variables
        ? redactSensitive(context.variables, this.config)
        : undefined,
    };
  }

  /**
   * Log simple GraphQL information
   */
  private logSimple(context: GraphQLLogContext): void {
    const {
      operation,
      operationName,
      endpoint,
      duration,
      error,
      correlationId,
    } = context;

    const message = `GraphQL ${operation}${operationName ? ` "${operationName}"` : ""}`;
    const logContext: Record<string, any> = {
      graphql: true,
      operation,
      endpoint,
    };

    if (operationName) logContext.operationName = operationName;
    if (duration !== undefined) logContext.duration = `${duration}ms`;
    if (correlationId) logContext.correlationId = correlationId;

    if (error) {
      this.logger.error(message, error, logContext);
    } else {
      this.logger.info(message, logContext);
    }
  }

  /**
   * Log verbose GraphQL information including query and variables
   */
  private logVerbose(context: GraphQLLogContext): void {
    const {
      operation,
      operationName,
      endpoint,
      variables,
      query,
      duration,
      error,
      correlationId,
    } = context;

    const message = `GraphQL ${operation}${operationName ? ` "${operationName}"` : ""}`;
    const logContext: Record<string, any> = {
      graphql: true,
      operation,
      endpoint,
      query: query ? this.truncateQuery(query) : undefined,
      variables,
    };

    if (operationName) logContext.operationName = operationName;
    if (duration !== undefined) logContext.duration = `${duration}ms`;
    if (correlationId) logContext.correlationId = correlationId;

    if (error) {
      this.logger.error(message, error, logContext);
    } else {
      this.logger.info(message, logContext);
    }
  }

  /**
   * Truncate long queries for logging
   */
  private truncateQuery(query: string, maxLength: number = 500): string {
    if (query.length <= maxLength) return query;
    return `${query.substring(0, maxLength)}... [truncated]`;
  }

  /**
   * Create a timer for measuring GraphQL operation duration
   */
  startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }

  /**
   * Log a GraphQL error
   */
  logError(
    operation: string,
    error: Error,
    context?: Partial<GraphQLLogContext>,
  ): void {
    const logContext: Record<string, any> = {
      graphql: true,
      operation,
      ...context,
    };

    this.logger.error(`GraphQL ${operation} failed`, error, logContext);
  }
}
