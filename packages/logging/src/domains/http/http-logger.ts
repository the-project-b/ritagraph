import type { Request, Response, NextFunction } from "express";
import type { Logger } from "../../core/logger.js";
import type { LoggingConfig, HTTPLogContext } from "../../core/types.js";
import { redactSensitive, sanitizeHeaders } from "../../utils/redaction.js";
import { shouldSample } from "../../utils/sampling.js";

/**
 * HTTP request/response logging middleware for Express
 */
export class HTTPLogger {
  constructor(
    private logger: Logger,
    private config: LoggingConfig,
  ) {}

  /**
   * Express middleware for logging HTTP requests and responses
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip if both request and response logging are disabled
      if (!this.config.httpRequests && !this.config.httpResponses) {
        return next();
      }

      // Apply sampling rate
      if (!shouldSample(this.config.sampleRate)) {
        return next();
      }

      const startTime = Date.now();
      const correlationId = this.extractCorrelationId(req);

      // Log request
      if (this.config.httpRequests) {
        this.logRequest(req, correlationId);
      }

      // Capture response
      if (this.config.httpResponses) {
        const originalSend = res.send;
        res.send = function (data: any) {
          res.send = originalSend;
          const result = res.send(data);

          // Log response after sending
          const duration = Date.now() - startTime;
          this.logResponse(req, res, duration, correlationId);

          return result;
        }.bind(this);
      }

      next();
    };
  }

  /**
   * Extract correlation ID from request headers
   */
  private extractCorrelationId(req: Request): string | undefined {
    const header = this.config.correlationIdHeader.toLowerCase();
    const correlationId = req.headers[header] as string | undefined;

    if (correlationId) {
      // Store it for downstream use
      (req as any).correlationId = correlationId;
    }

    return correlationId;
  }

  /**
   * Log HTTP request
   */
  private logRequest(req: Request, correlationId?: string): void {
    const context: HTTPLogContext = {
      method: req.method,
      url: req.url,
      path: req.path,
      query: redactSensitive(req.query, this.config),
      headers: sanitizeHeaders(req.headers, this.config),
      ip: req.ip,
    };

    if (correlationId) {
      context.correlationId = correlationId;
    }

    if (req.body && Object.keys(req.body).length > 0) {
      context.body = redactSensitive(req.body, this.config);
    }

    this.logger.info(`→ ${req.method} ${req.path}`, {
      http: true,
      type: "request",
      ...context,
    });
  }

  /**
   * Log HTTP response
   */
  private logResponse(
    req: Request,
    res: Response,
    duration: number,
    correlationId?: string,
  ): void {
    const context: HTTPLogContext = {
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    };

    if (correlationId) {
      context.correlationId = correlationId;
    }

    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    const message = `← ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`;
    const logContext = {
      http: true,
      type: "response",
      ...context,
      statusMessage: res.statusMessage,
      duration: `${duration}ms`,
    };

    if (level === "error") {
      this.logger.error(message, undefined, logContext);
    } else if (level === "warn") {
      this.logger.warn(message, logContext);
    } else {
      this.logger.info(message, logContext);
    }
  }

  /**
   * Log HTTP error
   */
  logError(req: Request, error: Error, statusCode: number = 500): void {
    const context: HTTPLogContext = {
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode,
      headers: sanitizeHeaders(req.headers, this.config),
    };

    this.logger.error(`HTTP Error: ${req.method} ${req.path}`, error, {
      http: true,
      type: "error",
      ...context,
    });
  }
}
