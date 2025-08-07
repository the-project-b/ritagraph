import type { LoggerOptions } from "pino";

/**
 * Log levels supported by the logger
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Output format for logs
 */
export type LogFormat = "json" | "pretty" | "compact";

/**
 * GraphQL logging levels
 */
export enum GraphQLLogLevel {
  OFF = "false",
  SIMPLE = "true",
  VERBOSE = "verbose",
}

/**
 * Configuration for the logger
 */
export interface LoggerConfig extends LoggerOptions {
  service?: string;
  environment?: string;
  prettyPrint?: boolean;
  useEnvConfig?: boolean;
}

/**
 * Context object for structured logging
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Environment-based logging configuration
 */
export interface LoggingConfig {
  // Core settings
  level: string;
  format: LogFormat;

  // Feature toggles
  graphql: GraphQLLogLevel;
  httpRequests: boolean;
  httpResponses: boolean;

  // Enhancement options
  redactSensitive: boolean;
  includeCaller: boolean;
  correlationIdHeader: string;

  // Pretty print options
  colorize: boolean;
  singleLine: boolean;
  translateTime: string | boolean;

  // Performance
  sampleRate: number; // 0-1, where 1 means log everything
}

/**
 * GraphQL operation context for logging
 */
export interface GraphQLLogContext {
  operation: "query" | "mutation" | "subscription";
  operationName?: string;
  endpoint: string;
  variables?: Record<string, any>;
  query?: string;
  duration?: number;
  error?: Error;
  correlationId?: string;
}

/**
 * HTTP request/response context for logging
 */
export interface HTTPLogContext {
  method: string;
  url: string;
  path: string;
  statusCode?: number;
  duration?: number;
  correlationId?: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, any>;
  ip?: string;
}
