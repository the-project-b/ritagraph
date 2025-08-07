import { GraphQLLogLevel, type LoggingConfig } from "./types.js";
import { parseSampleRate } from "../utils/sampling.js";

/**
 * Parse GraphQL log level from environment variable
 */
function parseGraphQLLogLevel(value?: string): GraphQLLogLevel {
  if (!value || value === "false") return GraphQLLogLevel.OFF;
  if (value === "verbose") return GraphQLLogLevel.VERBOSE;
  if (value === "true") return GraphQLLogLevel.SIMPLE;
  return GraphQLLogLevel.OFF;
}

/**
 * Parse environment variables to create logging configuration
 */
export function getLoggingConfig(): LoggingConfig {
  const format = process.env.LOGGING_OUTPUT_FORMAT as
    | "json"
    | "pretty"
    | "compact"
    | undefined;

  // Default to development (pretty) if NODE_ENV is not set
  const isDevelopment =
    !process.env.NODE_ENV || process.env.NODE_ENV === "development";

  return {
    // Core settings
    level: process.env.LOG_LEVEL || "info",
    format: format || (isDevelopment ? "pretty" : "json"),

    // Feature toggles
    graphql: parseGraphQLLogLevel(process.env.LOGGING_LOG_GRAPHQL),
    httpRequests: process.env.LOGGING_LOG_HTTP_REQUESTS === "true",
    httpResponses: process.env.LOGGING_LOG_HTTP_RESPONSES === "true",

    // Enhancement options
    redactSensitive: process.env.LOGGING_REDACT_SENSITIVE !== "false", // Default true for safety
    includeCaller: process.env.LOGGING_INCLUDE_CALLER === "true",
    correlationIdHeader:
      process.env.LOGGING_CORRELATION_ID_HEADER || "x-correlation-id",

    // Pretty print options
    colorize: process.env.LOGGING_COLOR !== "false",
    singleLine: process.env.LOGGING_SINGLE_LINE === "true",
    translateTime: process.env.LOGGING_TRANSLATE_TIME || "SYS:standard",

    // Performance
    sampleRate: parseSampleRate(process.env.LOGGING_SAMPLE_RATE),
  };
}

/**
 * Create default configuration
 */
export function getDefaultConfig(): LoggingConfig {
  return {
    level: "info",
    format: "json",
    graphql: GraphQLLogLevel.OFF,
    httpRequests: false,
    httpResponses: false,
    redactSensitive: true,
    includeCaller: false,
    correlationIdHeader: "x-correlation-id",
    colorize: true,
    singleLine: false,
    translateTime: "SYS:standard",
    sampleRate: 1,
  };
}
