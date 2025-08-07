/**
 * @the-project-b/logging
 * Centralized logging package with Pino
 */

// Core exports
export { Logger } from "./core/logger.js";
export { getLoggingConfig, getDefaultConfig } from "./core/config.js";

// Type exports
export type {
  LoggerConfig,
  LogContext,
  LoggingConfig,
  LogLevel,
  LogFormat,
  GraphQLLogContext,
  HTTPLogContext,
} from "./core/types.js";

export { GraphQLLogLevel } from "./core/types.js";

// Domain loggers
export { GraphQLLogger } from "./domains/graphql/graphql-logger.js";
export { HTTPLogger } from "./domains/http/http-logger.js";

// Utilities
export {
  redactSensitive,
  sanitizeHeaders,
  SENSITIVE_FIELDS,
  REDACTED,
} from "./utils/redaction.js";
export { shouldSample, parseSampleRate } from "./utils/sampling.js";

// Formatters
export {
  createPrettyOptions,
  createPrettyTransport,
} from "./formatters/pretty.js";

// Re-export pino types for convenience
export type { Logger as PinoLogger, LoggerOptions } from "pino";

// Re-export pino-pretty for use in package.json scripts
export { default as pinoPretty } from "pino-pretty";

// Factory function to create a logger instance
import { Logger } from "./core/logger.js";
import type { LoggerConfig } from "./core/types.js";

/**
 * Create a new logger instance with the given configuration
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Default logger instance
 */
export const defaultLogger = createLogger();
