/**
 * Result type for handling success and failure cases in a type-safe way.
 * Inspired by Rust's Result<T, E> and functional programming patterns.
 */

export type Ok<T> = {
  readonly kind: "ok";
  readonly value: T;
};

export type Err<E> = {
  readonly kind: "err";
  readonly error: E;
};

export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Type guards
 */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => {
  return result.kind === "ok";
};

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => {
  return result.kind === "err";
};

/**
 * Constructors
 */
export const ok = <T>(value: T): Ok<T> => ({
  kind: "ok",
  value,
});

export const err = <E>(error: E): Err<E> => ({
  kind: "err",
  error,
});

/**
 * Unwrap functions (use with caution - these can throw)
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (isOk(result)) {
    return result.value;
  }
  throw new Error(`Attempted to unwrap an Err: ${String(result.error)}`);
};

export const unwrapErr = <T, E>(result: Result<T, E>): E => {
  if (isErr(result)) {
    return result.error;
  }
  throw new Error("Attempted to unwrapErr an Ok value");
};

/**
 * Safe unwrap with default value
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  return isOk(result) ? result.value : defaultValue;
};

export const unwrapOrElse = <T, E>(
  result: Result<T, E>,
  fn: (error: E) => T,
): T => {
  return isOk(result) ? result.value : fn(result.error);
};

/**
 * Mapping functions
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => {
  return isOk(result) ? ok(fn(result.value)) : result;
};

export const mapErr = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> => {
  return isErr(result) ? err(fn(result.error)) : result;
};

export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => {
  return isOk(result) ? fn(result.value) : result;
};

export const flatMapErr = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => Result<T, F>,
): Result<T, F> => {
  return isErr(result) ? fn(result.error) : result;
};

/**
 * Async mapping functions
 */
export const mapAsync = async <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<U>,
): Promise<Result<U, E>> => {
  return isOk(result) ? ok(await fn(result.value)) : result;
};

export const flatMapAsync = async <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>,
): Promise<Result<U, E>> => {
  return isOk(result) ? fn(result.value) : result;
};

/**
 * Combine multiple results
 */
export const all = <T, E>(
  results: ReadonlyArray<Result<T, E>>,
): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
};

export const allSettled = <T, E>(
  results: ReadonlyArray<Result<T, E>>,
): { successes: T[]; failures: E[] } => {
  const successes: T[] = [];
  const failures: E[] = [];

  for (const result of results) {
    if (isOk(result)) {
      successes.push(result.value);
    } else {
      failures.push(result.error);
    }
  }

  return { successes, failures };
};

/**
 * Pattern matching helper
 */
export const match = <T, E, R>(
  result: Result<T, E>,
  patterns: {
    ok: (value: T) => R;
    err: (error: E) => R;
  },
): R => {
  return isOk(result) ? patterns.ok(result.value) : patterns.err(result.error);
};

/**
 * Try-catch wrapper
 */
export const tryCatch = <T, E = Error>(
  fn: () => T,
  mapError?: (error: unknown) => E,
): Result<T, E> => {
  try {
    return ok(fn());
  } catch (error) {
    const mappedError = mapError ? mapError(error) : (error as E);
    return err(mappedError);
  }
};

export const tryCatchAsync = async <T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (error: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    return ok(await fn());
  } catch (error) {
    const mappedError = mapError ? mapError(error) : (error as E);
    return err(mappedError);
  }
};

/**
 * Validation helpers
 */
export const validate = <T, E>(
  value: T,
  validator: (value: T) => E | null,
): Result<T, E> => {
  const error = validator(value);
  return error === null ? ok(value) : err(error);
};

export const validateAll = <T, E>(
  value: T,
  validators: ReadonlyArray<(value: T) => E | null>,
): Result<T, E[]> => {
  const errors: E[] = [];
  for (const validator of validators) {
    const error = validator(value);
    if (error !== null) {
      errors.push(error);
    }
  }
  return errors.length === 0 ? ok(value) : err(errors);
};

/**
 * Conversion helpers
 */
export const fromNullable = <T, E>(
  value: T | null | undefined,
  error: E,
): Result<T, E> => {
  return value !== null && value !== undefined ? ok(value) : err(error);
};

export const toNullable = <T, E>(result: Result<T, E>): T | null => {
  return isOk(result) ? result.value : null;
};

/**
 * Effect helpers (for side effects)
 */
export const tap = <T, E>(
  result: Result<T, E>,
  fn: (value: T) => void,
): Result<T, E> => {
  if (isOk(result)) {
    fn(result.value);
  }
  return result;
};

export const tapErr = <T, E>(
  result: Result<T, E>,
  fn: (error: E) => void,
): Result<T, E> => {
  if (isErr(result)) {
    fn(result.error);
  }
  return result;
};
