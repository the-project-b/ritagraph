import pino from "pino";
import type { Logger as PinoLoggerType, LoggerOptions } from "pino";
import { getLoggingConfig, getDefaultConfig } from "./config.js";
import type { LoggerConfig, LogContext, LoggingConfig } from "./types.js";
import { shouldSample } from "../utils/sampling.js";
import { createPrettyTransport } from "../formatters/pretty.js";
import { GraphQLLogger } from "../domains/graphql/graphql-logger.js";
import { HTTPLogger } from "../domains/http/http-logger.js";
import fs from "node:fs";
import path from "node:path";

// Store file destinations per service to reuse them
const fileDestinations = new Map<string, any>();
// Store buffered logs per service until threshold is reached
const bufferedLogs = new Map<
  string,
  Array<{ level: string; obj: any; msg: string }>
>();
// Number of logs to buffer before starting file writing
const BUFFER_THRESHOLD = 3;

/**
 * Get or set the shared log session timestamp
 */
function getLogSessionTimestamp(): number {
  // Check if we already have a session timestamp from environment
  if (process.env.LOGGER_SESSION_TIMESTAMP) {
    return parseInt(process.env.LOGGER_SESSION_TIMESTAMP, 10);
  }

  // Create a new session timestamp and set it in environment for child processes
  const timestamp = Date.now();
  process.env.LOGGER_SESSION_TIMESTAMP = timestamp.toString();
  return timestamp;
}

/**
 * Get or create file logging setup for development
 */
function getOrCreateFileSetup(
  serviceName?: string,
  filePath?: string,
): { logFile: string; destination: any } | null {
  // Only in development and when explicitly enabled
  const isDevelopment =
    !process.env.NODE_ENV || process.env.NODE_ENV === "development";
  if (!isDevelopment || process.env.LOGGER_LOG_TO_FILE !== "true") {
    return null;
  }

  const service = serviceName || "unknown";

  // Check if we already have a file destination for this service
  const existingDestination = fileDestinations.get(service);
  if (existingDestination) {
    return existingDestination;
  }

  const logDir = filePath ? filePath : path.join(process.cwd(), "logs");

  try {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Create .gitignore in logs folder if it doesn't exist
    const gitignorePath = path.join(logDir, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, "*.log\n");
    }

    // Use shared session timestamp for all services in this run
    const timestamp = getLogSessionTimestamp();
    const logFile = path.join(logDir, `logs-${service}-${timestamp}.log`);

    // Create the destination
    const destination = pino.destination({
      dest: logFile,
      sync: false, // Async for better performance
    });

    const setup = { logFile, destination };
    // Don't store here, let the caller decide when to store
    return setup;
  } catch (err) {
    // Silently fail if file system operations fail (e.g., in read-only environments)
    console.warn("Failed to initialize file logging:", err);
    return null;
  }
}

export class Logger {
  private pinoInstance: PinoLoggerType;
  private context: LogContext = {};
  private config: LoggingConfig;
  private _graphql?: GraphQLLogger;
  private _http?: HTTPLogger;
  private serviceName?: string;
  private logBuffer?: Array<{ level: string; obj: any; msg: string }>;
  private fileDestination?: any;

  constructor(config: LoggerConfig = {}) {
    const {
      service,
      environment,
      prettyPrint,
      path,
      useEnvConfig = true,
      ...pinoOptions
    } = config;

    this.serviceName = service;

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
    const isLanggraph =
      process.env.LANGGRAPH_API_URL ||
      process.argv.some((arg) => arg.includes("langgraph"));

    // Disable pretty printing in langgraph to avoid worker thread JSON parse errors
    const usePrettyPrint = shouldPrettyPrint && !isLanggraph;

    // Initially create logger without file logging
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

    // Set up buffering if file logging is enabled
    if (this.config.logToFile && service) {
      // Get or create buffer for this service
      if (!bufferedLogs.has(service)) {
        bufferedLogs.set(service, []);
      }
      this.logBuffer = bufferedLogs.get(service);
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
   * Handle log buffering and file initialization
   */
  private handleFileLogging(level: string, obj: any, msg: string): void {
    // Skip if file logging is not configured
    if (!this.config.logToFile || !this.serviceName) {
      return;
    }

    // Check if we already have a file destination for this service
    const existingSetup = fileDestinations.get(this.serviceName);
    if (existingSetup && existingSetup.destination) {
      // File logging is already active, write directly
      const logEntry = {
        level: level.toUpperCase(),
        time: Date.now(),
        ...obj,
        msg,
      };
      existingSetup.destination.write(`${JSON.stringify(logEntry)}\n`);
      return;
    }

    // Get or create buffer for this service
    if (!this.logBuffer) {
      if (!bufferedLogs.has(this.serviceName)) {
        bufferedLogs.set(this.serviceName, []);
      }
      this.logBuffer = bufferedLogs.get(this.serviceName);
    }

    // Buffer the log
    if (this.logBuffer) {
      this.logBuffer.push({ level, obj, msg });

      // Check if we've reached the threshold
      if (this.logBuffer.length >= BUFFER_THRESHOLD) {
        // Initialize file logging
        const fileSetup = getOrCreateFileSetup(this.serviceName);
        if (fileSetup && fileSetup.destination) {
          // Store the setup for future use
          fileDestinations.set(this.serviceName, fileSetup);

          // Write all buffered logs
          for (const buffered of this.logBuffer) {
            const logEntry = {
              level: buffered.level.toUpperCase(),
              time: Date.now(),
              ...buffered.obj,
              msg: buffered.msg,
            };
            fileSetup.destination.write(`${JSON.stringify(logEntry)}\n`);
          }

          // Clear the buffer - it's no longer needed for this service
          this.logBuffer.length = 0;
        }
      }
    }
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
      this.handleFileLogging(
        "trace",
        { ...this.pinoInstance.bindings(), ...(context || {}) },
        message,
      );
    }
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: LogContext): void {
    if (shouldSample(this.config.sampleRate)) {
      this.pinoInstance.debug(context || {}, message);
      this.handleFileLogging(
        "debug",
        { ...this.pinoInstance.bindings(), ...(context || {}) },
        message,
      );
    }
  }

  /**
   * Log at info level
   */
  info(message: string, context?: LogContext): void {
    if (shouldSample(this.config.sampleRate)) {
      this.pinoInstance.info(context || {}, message);
      this.handleFileLogging(
        "info",
        { ...this.pinoInstance.bindings(), ...(context || {}) },
        message,
      );
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
      this.handleFileLogging(
        "warn",
        { ...this.pinoInstance.bindings(), ...(context || {}) },
        message,
      );
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
    this.handleFileLogging(
      "error",
      { ...this.pinoInstance.bindings(), ...errorContext },
      message,
    );
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
    this.handleFileLogging(
      "fatal",
      { ...this.pinoInstance.bindings(), ...errorContext },
      message,
    );
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
