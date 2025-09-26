/**
 * Class-based Result wrapper for OOP-style usage.
 * Wraps the functional Result type with method chaining.
 */

import * as R from "./result.js";

export class Result<T, E> {
  private constructor(private readonly inner: R.Result<T, E>) {}

  static ok<T>(value: T): Result<T, never> {
    return new Result(R.ok(value));
  }

  static err<E>(error: E): Result<never, E> {
    return new Result(R.err(error));
  }

  static fromResult<T, E>(result: R.Result<T, E>): Result<T, E> {
    return new Result(result);
  }

  static tryCatch<T, E = Error>(
    fn: () => T,
    mapError?: (error: unknown) => E,
  ): Result<T, E> {
    return new Result(R.tryCatch(fn, mapError));
  }

  static async tryCatchAsync<T, E = Error>(
    fn: () => Promise<T>,
    mapError?: (error: unknown) => E,
  ): Promise<Result<T, E>> {
    return new Result(await R.tryCatchAsync(fn, mapError));
  }

  static fromNullable<T, E>(
    value: T | null | undefined,
    error: E,
  ): Result<T, E> {
    return new Result(R.fromNullable(value, error));
  }

  static all<T, E>(results: ReadonlyArray<Result<T, E>>): Result<T[], E> {
    const innerResults = results.map((r) => r.inner);
    return new Result(R.all(innerResults));
  }

  static allSettled<T, E>(
    results: ReadonlyArray<Result<T, E>>,
  ): { successes: T[]; failures: E[] } {
    const innerResults = results.map((r) => r.inner);
    return R.allSettled(innerResults);
  }

  isOk(): boolean {
    return R.isOk(this.inner);
  }

  isErr(): boolean {
    return R.isErr(this.inner);
  }

  unwrap(): T {
    return R.unwrap(this.inner);
  }

  unwrapErr(): E {
    return R.unwrapErr(this.inner);
  }

  unwrapOr(defaultValue: T): T {
    return R.unwrapOr(this.inner, defaultValue);
  }

  unwrapOrElse(fn: (error: E) => T): T {
    return R.unwrapOrElse(this.inner, fn);
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new Result(R.map(this.inner, fn));
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Result(R.mapErr(this.inner, fn));
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return new Result(R.flatMap(this.inner, (value) => fn(value).inner));
  }

  flatMapErr<F>(fn: (error: E) => Result<T, F>): Result<T, F> {
    return new Result(R.flatMapErr(this.inner, (error) => fn(error).inner));
  }

  async mapAsync<U>(fn: (value: T) => Promise<U>): Promise<Result<U, E>> {
    return new Result(await R.mapAsync(this.inner, fn));
  }

  async flatMapAsync<U>(
    fn: (value: T) => Promise<Result<U, E>>,
  ): Promise<Result<U, E>> {
    return new Result(
      await R.flatMapAsync(this.inner, async (value) => {
        const result = await fn(value);
        return result.inner;
      }),
    );
  }

  match<R>(patterns: { ok: (value: T) => R; err: (error: E) => R }): R {
    return R.match(this.inner, patterns);
  }

  tap(fn: (value: T) => void): Result<T, E> {
    return new Result(R.tap(this.inner, fn));
  }

  tapErr(fn: (error: E) => void): Result<T, E> {
    return new Result(R.tapErr(this.inner, fn));
  }

  toNullable(): T | null {
    return R.toNullable(this.inner);
  }

  toResult(): R.Result<T, E> {
    return this.inner;
  }

  /**
   * Type guard for narrowing in conditional statements
   */
  ok(): this is Result<T, never> & { value: T } {
    return this.isOk();
  }

  /**
   * Type guard for narrowing in conditional statements
   */
  err(): this is Result<never, E> & { error: E } {
    return this.isErr();
  }

  /**
   * Get the value if Ok, requires type guard check first
   */
  get value(): T {
    if (!this.isOk()) {
      throw new Error("Cannot access value on Err Result");
    }
    return R.unwrap(this.inner);
  }

  /**
   * Get the error if Err, requires type guard check first
   */
  get error(): E {
    if (!this.isErr()) {
      throw new Error("Cannot access error on Ok Result");
    }
    return R.unwrapErr(this.inner);
  }
}
