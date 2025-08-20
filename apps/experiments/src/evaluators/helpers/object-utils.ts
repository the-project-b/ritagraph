/**
 * Utility functions for object manipulation and path-based operations
 */

/**
 * Gets a value from an object using dot notation path
 * Supports nested objects and arrays
 *
 * @param obj - The object to get value from
 * @param path - Dot notation path (e.g., "mutationVariables.data.effectiveDate")
 * @returns The value at the path, or undefined if not found
 */
export function getValueAtPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayName, index] = arrayMatch;
      current = current?.[arrayName]?.[parseInt(index, 10)];
    } else {
      current = current?.[part];
    }

    if (current === undefined) {
      return undefined;
    }
  }

  return current;
}

/**
 * Sets a value in an object using dot notation path
 * Creates nested objects as needed
 *
 * @param obj - The object to modify (will be mutated)
 * @param path - Dot notation path
 * @param value - The value to set
 * @returns The modified object
 */
export function setValueAtPath(obj: any, path: string, value: any): any {
  if (!obj || !path) return obj;

  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayName, index] = arrayMatch;
      const idx = parseInt(index, 10);

      if (!current[arrayName]) {
        current[arrayName] = [];
      }
      if (!current[arrayName][idx]) {
        current[arrayName][idx] = {};
      }
      current = current[arrayName][idx];
    } else {
      if (!current[part] || typeof current[part] !== "object") {
        current[part] = {};
      }
      current = current[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  const arrayMatch = lastPart.match(/^(.+)\[(\d+)\]$/);

  if (arrayMatch) {
    const [, arrayName, index] = arrayMatch;
    if (!current[arrayName]) {
      current[arrayName] = [];
    }
    current[arrayName][parseInt(index, 10)] = value;
  } else {
    current[lastPart] = value;
  }

  return obj;
}

/**
 * Checks if a value exists at a path in an object
 *
 * @param obj - The object to check
 * @param path - Dot notation path
 * @returns True if value exists at path (even if null), false otherwise
 */
export function hasValueAtPath(obj: any, path: string): boolean {
  if (!obj || !path) return false;

  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;

    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, arrayName, index] = arrayMatch;
      const idx = parseInt(index, 10);

      if (isLast) {
        return current?.[arrayName]?.[idx] !== undefined;
      }

      current = current?.[arrayName]?.[idx];
    } else {
      if (isLast) {
        return part in (current || {});
      }

      current = current?.[part];
    }

    if (current === undefined) {
      return false;
    }
  }

  return true;
}

/**
 * Deep clones an object
 *
 * @param obj - The object to clone
 * @returns A deep copy of the object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }

  if (obj instanceof Array) {
    return obj.map((item) => deepClone(item)) as any;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }

  return cloned;
}

/**
 * Checks if a path matches a pattern (supports wildcards)
 *
 * @param path - The path to check
 * @param pattern - The pattern to match (can include .* for wildcards)
 * @returns True if path matches pattern
 */
export function pathMatchesPattern(path: string, pattern: string): boolean {
  if (path === pattern) return true;

  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return path.startsWith(`${prefix}.`) || path === prefix;
  }

  return false;
}

/**
 * Compares two values for deep equality
 *
 * @param a - First value
 * @param b - Second value
 * @returns True if values are deeply equal
 */
export function deepEquals(a: any, b: any): boolean {
  if (a === b) return true;

  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;

  if (typeof a !== typeof b) return false;

  if (typeof a !== "object") {
    return String(a) === String(b);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEquals(item, b[index]));
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => {
    if (!(key in b)) return false;
    return deepEquals(a[key], b[key]);
  });
}
