/**
 * Common domain primitive types
 */

/**
 * UUID v4 string
 */
export type UUID = string & { readonly __brand: "UUID" };

/**
 * Email address string
 */
export type Email = string & { readonly __brand: "Email" };

/**
 * ISO 8601 date string (e.g., "2023-12-25T10:30:00Z")
 */
export type ISODateString = string & { readonly __brand: "ISODateString" };

/**
 * Unix timestamp in milliseconds
 */
export type Timestamp = number & { readonly __brand: "Timestamp" };

/**
 * Non-empty string
 */
export type NonEmptyString = string & { readonly __brand: "NonEmptyString" };

/**
 * URL string
 */
export type URL = string & { readonly __brand: "URL" };

/**
 * JSON string
 */
export type JSONString = string & { readonly __brand: "JSONString" };

/**
 * Positive number
 */
export type PositiveNumber = number & { readonly __brand: "PositiveNumber" };

/**
 * Non-negative number (0 or positive)
 */
export type NonNegativeNumber = number & {
  readonly __brand: "NonNegativeNumber";
};

/**
 * Integer
 */
export type Integer = number & { readonly __brand: "Integer" };

/**
 * Percentage (0-100)
 */
export type Percentage = number & { readonly __brand: "Percentage" };
