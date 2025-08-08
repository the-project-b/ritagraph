import pino from "pino";
import type { Logger as PinoLoggerType, LoggerOptions } from "pino";
import { getLoggingConfig, getDefaultConfig } from "./config.js";
import type { LoggerConfig, LogContext, LoggingConfig } from "./types.js";
import { shouldSample } from "../utils/sampling.js";
import { createPrettyTransport } from "../formatters/pretty.js";
import { GraphQLLogger } from "../domains/graphql/graphql-logger.js";
import { HTTPLogger } from "../domains/http/http-logger.js";

export class Logger {
  private pinoInstance: PinoLoggerType;
  private context: LogContext = {};
  private config: LoggingConfig;
  private _graphql?: GraphQLLogger;
  private _http?: HTTPLogger;

  constructor(config: LoggerConfig = {}) {
    const {
      service,
      environment,
      prettyPrint,
      useEnvConfig = true,
      ...pinoOptions
    } = config;

    // Load configuration
    this.config = useEnvConfig ? getLoggingConfig() : getDefaultConfig();

    // Override with explicit config
    if (config.level) this.config.level = config.level;

    const isDevelopment =
      environment === "development" || process.env.NODE_ENV === "development";

    // Determine if we should use pretty printing
    const shouldPrettyPrint =
      prettyPrint !== undefined
        ? prettyPrint
        : this.config.format === "pretty" ||
          (isDevelopment && this.config.format !== "json");

    const options: LoggerOptions = {
      level: this.config.level,
      ...pinoOptions,
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() };
        },
        ...pinoOptions.formatters,
      },
      base: {
        service: service || "ritagraph",
        environment: environment || process.env.NODE_ENV || "development",
        pid: process.pid,
        ...pinoOptions.base,
      },
    };

    // Add caller information if requested
    if (this.config.includeCaller) {
      options.mixin = () => {
        const stack = new Error().stack;
        if (stack) {
          const lines = stack.split("\n");
          // Skip first 3 lines (Error, mixin function, logger method)
          const callerLine = lines[3];
          if (callerLine) {
            const match = callerLine.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);
            if (match) {
              return {
                caller: {
                  function: match[1],
                  file: match[2],
                  line: parseInt(match[3], 10),
                },
              };
            }
          }
        }
        return {};
      };
    }

    // Check if we're running in langgraph environment where worker threads cause issues
    const isLanggraph = process.env.LANGGRAPH_API_URL || process.argv.some(arg => arg.includes('langgraph'));
    
    // Disable pretty printing in langgraph to avoid worker thread JSON parse errors
    const usePrettyPrint = shouldPrettyPrint && !isLanggraph;
    
    if (usePrettyPrint) {
      // Use pretty transport with worker threads for better performance
      this.pinoInstance = pino({
        ...options,
        transport: createPrettyTransport(this.config),
      });
    } else {
      // Use standard JSON output (for production or langgraph environments)
      this.pinoInstance = pino(options);
    }
  }

  /**
   * Get GraphQL logger utility
   */
  get graphql(): GraphQLLogger {
    if (!this._graphql) {
      this._graphql = new GraphQLLogger(this, this.config);
    }
    return this._graphql;
  }

  /**
   * Get HTTP logger utility
   */
  get http(): HTTPLogger {
    if (!this._http) {
      this._http = new HTTPLogger(this, this.config);
    }
    return this._http;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const childLogger = Object.create(this);
    childLogger.pinoInstance = this.pinoInstance.child(context);
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  /**
   * Set persistent context for this logger instance
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
    this.pinoInstance = this.pinoInstance.child(this.context);
  }

  /**
   * Clear all context from this logger instance
   */
  clearContext(): void {
    this.context = {};
    // Create a new logger instance without the context
    const config = this.pinoInstance.bindings();
    this.pinoInstance = pino({
      level: this.pinoInstance.level,
      base: {
        service: config.service,
        environment: config.environment,
        pid: config.pid,
      },
    });
  }

  /**
   * Log at trace level
   */
  trace(message: string, context?: LogContext): void {
    if (shouldSample(this.config.sampleRate)) {
      this.pinoInstance.trace(context || {}, message);
    }
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: LogContext): void {
    if (shouldSample(this.config.sampleRate)) {
      this.pinoInstance.debug(context || {}, message);
    }
  }

  /**
   * Log at info level
   */
  info(message: string, context?: LogContext): void {
    if (shouldSample(this.config.sampleRate)) {
      this.pinoInstance.info(context || {}, message);
    }
  }

  /**
   * Log at info level (alias for info)
   */
  log(message: string, context?: LogContext): void {
    this.info(message, context);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: LogContext): void {
    if (shouldSample(this.config.sampleRate)) {
      this.pinoInstance.warn(context || {}, message);
    }
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    // Always log errors, regardless of sampling
    const errorContext: LogContext = { ...context };

    if (error instanceof Error) {
      errorContext.error = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    } else if (error !== undefined) {
      errorContext.error = error;
    }

    this.pinoInstance.error(errorContext, message);
  }

  /**
   * Log at fatal level
   */
  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    // Always log fatal errors, regardless of sampling
    const errorContext: LogContext = { ...context };

    if (error instanceof Error) {
      errorContext.error = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    } else if (error !== undefined) {
      errorContext.error = error;
    }

    this.pinoInstance.fatal(errorContext, message);
  }

  /**
   * Get the underlying Pino instance for advanced usage
   */
  getPinoInstance(): PinoLoggerType {
    return this.pinoInstance;
  }

  /**
   * Check if a given log level is enabled
   */
  isLevelEnabled(level: string): boolean {
    return this.pinoInstance.isLevelEnabled(level);
  }

  /**
   * Get the current configuration
   */
  getConfig(): LoggingConfig {
    return this.config;
  }
}
