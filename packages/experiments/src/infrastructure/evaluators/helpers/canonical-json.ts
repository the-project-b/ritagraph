/**
 * Canonical JSON utilities for consistent object comparison
 */

/**
 * Canonicalizes an object for consistent comparison
 */
export function canonicalizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(canonicalizeObject);
  }

  if (typeof obj === "object" && obj !== null) {
    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    for (const key of keys) {
      sortedObj[key] = canonicalizeObject(
        (obj as Record<string, unknown>)[key],
      );
    }
    return sortedObj;
  }

  return obj;
}
