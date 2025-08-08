import { createHash } from "crypto";

/**
 * Recursively sorts object keys to create a canonical representation.
 * This ensures that objects with the same data but different key orders
 * will produce the same JSON string, handling deeply nested structures.
 *
 * @param obj - Any value to canonicalize
 * @returns The canonicalized version of the input
 */
export function canonicalizeObject(obj: any): any {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return null;
  }

  // Handle primitives
  if (typeof obj !== "object") {
    return obj;
  }

  // Handle arrays - recursively canonicalize each element
  // Note: We do NOT sort arrays as order might be semantically important
  if (Array.isArray(obj)) {
    return obj.map((item) => canonicalizeObject(item));
  }

  // Handle objects - sort keys and recursively canonicalize values
  const sortedKeys = Object.keys(obj).sort();
  const canonicalObject: Record<string, any> = {};

  for (const key of sortedKeys) {
    canonicalObject[key] = canonicalizeObject(obj[key]);
  }

  return canonicalObject;
}

/**
 * Creates a deterministic JSON string from any object by canonicalizing it first.
 * Useful for comparing objects that may have keys in different orders.
 *
 * @param obj - The object to convert to canonical JSON
 * @returns A deterministic JSON string representation
 */
export function toCanonicalJSON(obj: any): string {
  const canonical = canonicalizeObject(obj);
  return JSON.stringify(canonical);
}

/**
 * Creates an MD5 hash from a canonical JSON representation of an object.
 * Ensures consistent hashing regardless of key order in nested objects.
 *
 * @param obj - The object to hash
 * @returns MD5 hash of the canonical JSON representation
 */
export function hashCanonicalObject(obj: any): string {
  const canonicalString = toCanonicalJSON(obj);
  return createHash("md5").update(canonicalString).digest("hex");
}
