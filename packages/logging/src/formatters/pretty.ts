import type { LoggingConfig } from "../core/types.js";

/**
 * Configuration for pino-pretty transport
 */
export interface PrettyFormatterOptions {
  colorize: boolean;
  translateTime: string | boolean;
  ignore: string;
  singleLine: boolean;
  messageFormat: string;
  errorLikeObjectKeys: string[];
  levelFirst?: boolean;
  messageKey?: string;
  timestampKey?: string;
}

/**
 * Create pretty formatter options based on configuration
 */
export function createPrettyOptions(
  config: LoggingConfig,
): PrettyFormatterOptions {
  const options: PrettyFormatterOptions = {
    colorize: config.colorize,
    translateTime: config.translateTime,
    ignore: "pid,hostname",
    singleLine: config.singleLine,
    messageFormat: "{msg}",
    errorLikeObjectKeys: ["err", "error"],
    levelFirst: false,
    messageKey: "msg",
    timestampKey: "time",
  };

  // Add custom message format for compact mode
  if (config.format === "compact") {
    options.singleLine = true;
    options.messageFormat = "{service} | {module} | {msg}";
  }

  return options;
}

/**
 * Create transport configuration for pretty printing
 */
export function createPrettyTransport(config: LoggingConfig) {
  return {
    target: "pino-pretty",
    options: createPrettyOptions(config),
  };
}
