/**
 * Type guards and validators for common types
 */

import type {
  UUID,
  Email,
  ISODateString,
  NonEmptyString,
  URL,
  JSONString,
  PositiveNumber,
  NonNegativeNumber,
  Integer,
  Percentage,
} from "./common.js";

/**
 * UUID validator
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUUID(value: unknown): value is UUID {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function asUUID(value: string): UUID {
  if (!isUUID(value)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return value;
}

/**
 * Email validator
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: unknown): value is Email {
  return typeof value === "string" && EMAIL_REGEX.test(value);
}

export function asEmail(value: string): Email {
  if (!isEmail(value)) {
    throw new Error(`Invalid email: ${value}`);
  }
  return value;
}

/**
 * ISO date string validator
 */
export function isISODateString(value: unknown): value is ISODateString {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString() === value;
}

export function asISODateString(value: string | Date): ISODateString {
  const dateStr = value instanceof Date ? value.toISOString() : value;
  if (!isISODateString(dateStr)) {
    throw new Error(`Invalid ISO date string: ${dateStr}`);
  }
  return dateStr;
}

/**
 * Non-empty string validator
 */
export function isNonEmptyString(value: unknown): value is NonEmptyString {
  return typeof value === "string" && value.trim().length > 0;
}

export function asNonEmptyString(value: string): NonEmptyString {
  if (!isNonEmptyString(value)) {
    throw new Error("String cannot be empty");
  }
  return value;
}

/**
 * URL validator
 */
export function isURL(value: unknown): value is URL {
  if (typeof value !== "string") return false;
  try {
    new globalThis.URL(value);
    return true;
  } catch {
    return false;
  }
}

export function asURL(value: string): URL {
  if (!isURL(value)) {
    throw new Error(`Invalid URL: ${value}`);
  }
  return value;
}

/**
 * JSON string validator
 */
export function isJSONString(value: unknown): value is JSONString {
  if (typeof value !== "string") return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function asJSONString(value: string | object): JSONString {
  const jsonStr = typeof value === "string" ? value : JSON.stringify(value);
  if (!isJSONString(jsonStr)) {
    throw new Error("Invalid JSON string");
  }
  return jsonStr;
}

/**
 * Positive number validator
 */
export function isPositiveNumber(value: unknown): value is PositiveNumber {
  return typeof value === "number" && value > 0 && isFinite(value);
}

export function asPositiveNumber(value: number): PositiveNumber {
  if (!isPositiveNumber(value)) {
    throw new Error(`Number must be positive: ${value}`);
  }
  return value;
}

/**
 * Non-negative number validator
 */
export function isNonNegativeNumber(
  value: unknown,
): value is NonNegativeNumber {
  return typeof value === "number" && value >= 0 && isFinite(value);
}

export function asNonNegativeNumber(value: number): NonNegativeNumber {
  if (!isNonNegativeNumber(value)) {
    throw new Error(`Number must be non-negative: ${value}`);
  }
  return value;
}

/**
 * Integer validator
 */
export function isInteger(value: unknown): value is Integer {
  return (
    typeof value === "number" && Number.isInteger(value) && isFinite(value)
  );
}

export function asInteger(value: number): Integer {
  if (!isInteger(value)) {
    throw new Error(`Number must be an integer: ${value}`);
  }
  return value;
}

/**
 * Percentage validator
 */
export function isPercentage(value: unknown): value is Percentage {
  return (
    typeof value === "number" && value >= 0 && value <= 100 && isFinite(value)
  );
}

export function asPercentage(value: number): Percentage {
  if (!isPercentage(value)) {
    throw new Error(`Number must be between 0 and 100: ${value}`);
  }
  return value;
}
