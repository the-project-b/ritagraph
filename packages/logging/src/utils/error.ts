/**
 * Error normalization utilities for logging.
 * Provides type-safe error handling for unknown error types.
 */

export type NormalizedError = {
  error: Error;
  message: string;
};

/**
 * Normalizes an unknown error value into a consistent Error object.
 * Useful for catch blocks where error type is unknown.
 *
 * @param error - Unknown error value from catch block
 * @returns Normalized error object with Error instance and message string
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   const { error: normalizedError, message } = normalizeError(error);
 *   logger.error("Operation failed", normalizedError, { errorMessage: message });
 * }
 * ```
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return { error, message: error.message };
  }
  const message = String(error);
  return { error: new Error(message), message };
}
