import type { LoggingConfig } from "../core/types.js";

/**
 * List of sensitive field names to redact
 */
export const SENSITIVE_FIELDS = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
  "authorization",
  "cookie",
  "sessionId",
  "creditCard",
  "ssn",
  "taxId",
  "bankAccount",
  "privateKey",
  "passphrase",
];

/**
 * Redaction placeholder
 */
export const REDACTED = "[REDACTED]";

/**
 * Check if a field name is sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some((field) =>
    lowerFieldName.includes(field.toLowerCase()),
  );
}

/**
 * Redact sensitive information from an object
 */
export function redactSensitive(obj: any, config: LoggingConfig): any {
  if (!config.redactSensitive || !obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, config));
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      result[key] = REDACTED;
    } else if (value && typeof value === "object") {
      result[key] = redactSensitive(value, config);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sanitize HTTP headers for logging
 */
export function sanitizeHeaders(
  headers: any,
  config: LoggingConfig,
): Record<string, any> {
  const sanitized = { ...headers };

  // Always redact these headers regardless of config
  const alwaysRedact = ["authorization", "cookie", "set-cookie", "x-api-key"];

  for (const header of alwaysRedact) {
    if (sanitized[header]) {
      sanitized[header] = REDACTED;
    }
    // Also check with different casing
    const upperHeader = header.toUpperCase();
    if (sanitized[upperHeader]) {
      sanitized[upperHeader] = REDACTED;
    }
  }

  // Apply general sensitive field redaction if enabled
  if (config.redactSensitive) {
    return redactSensitive(sanitized, config);
  }

  return sanitized;
}
