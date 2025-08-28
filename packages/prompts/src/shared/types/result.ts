/**
 * Pulled from the backend repo
 * Original Author: Ales
 * @module Result
 * @description
 *
 * This module implements a Result construct. The purpose of the Result is to
 * replace error driven flow control in the codebase with a more functional
 * approach.
 *
 * Should now all functions return a Result type? No. The result type comes with
 * a small cost of complexity as each result needs to be checked first before
 * being unwrapped. (The result left/right variants are purposely hide the value
 * under a private symbol so no one is tempted to access it directly and bypassing
 * the use of type guards).
 *
 * The Result should be used in cases where the function flow can fail in
 * an expected way. For example when creating a new user, the function can run
 * into a trouble if another user with the same username already exists. That
 * is not an unexpected error, but rather a business logic case. In such case
 * we should not drive the code by throwing an error but rather return a Failure.
 *
 * (Btw driving the code by exceptions is performance wise way more costly than
 * using a simple return.)
 *
 * We also don't want to replace framework parts like Nestjs error handling.
 * The resolver or controller endpoints should still throw errors because the
 * Nestjs framework is designed with error handling middlewares in mind.
 *
 * Please maintain 100% test coverage for this module.
 */
/*
Command to check the test coverage of this file:

npx jest src/common/types/result.spec.ts \
     --collectCoverageFrom="src/common/types/result.ts" \
     --collectCoverage=true
*/
export class ExhaustivePatternCheckError extends Error {
  constructor(n: never) {
    super(`ExhaustivePatternCheckError: Should never be here ${n}`);
  }
}

// #region Failure Type --------------------------------------------------------
const failureTag: unique symbol = Symbol("FailureTag");
export type Failure<Value = unknown> = {
  [failureTag]: Value;
};
// #endregion Failure Type

// #region Success Type --------------------------------------------------------
const successTag: unique symbol = Symbol("SuccessTag");
export type Success<Value = unknown> = {
  [successTag]: Value;
};
// #endregion Success Type

export type Result<S = unknown, F = unknown> = Success<S> | Failure<F>;

export type InferSuccess<R extends Result> =
  R extends Success<infer S> ? S : never;

export type InferFailure<R extends Result> =
  R extends Failure<infer F> ? F : never;

export type AddFailureType<R extends Result, F> = Result<
  InferSuccess<R>,
  InferFailure<R> | F
>;

// #region Result Factories ----------------------------------------------------
/**
 * ### Result Success Factory
 *
 * Factory function to create a success result.
 */
function success<S = never, F = never>(value: S): Result<S, F> {
  return { [successTag]: value } as Result<S, F>;
}
/**
 * ### Result Failure Factory
 *
 * Factory function to create a failure result.
 */
function failure<S = never, F = never>(value: F): Result<S, F> {
  return { [failureTag]: value } as Result<S, F>;
}
// #endregion Result Factories
// #region Type Guards ---------------------------------------------------------
/**
 * ### Is Success (Type Guard)
 *
 * Check if the result is a success. Function tells the typescript compiler
 * that the result is a success and we can safely unwrap the success value.
 *
 * @example
 * ```ts
 * if (Result.isSuccess(result)) {
 *  // Now it is safe to unwrap the success value and typescript compiler
 *  // will not complain about it.
 * }
 */
function isSuccess<S, F>(result: Result<S, F>): result is Success<S> {
  return successTag in result;
}
/**
 * ### Is Failure (Type Guard)
 *
 * Check if the result is a failure. Function tells the typescript compiler
 * that the result is a failure and we can safely unwrap the failure value.
 *
 * @example
 * ```ts
 * if (Result.isFailure(result)) {
 *  // Now it is safe to unwrap the failure value and typescript compiler
 *  // will not complain about it.
 * }
 * ```
 */
function isFailure<S, F>(result: Result<S, F>): result is Failure<F> {
  return failureTag in result;
}
// #endregion Type Guards
// #region Result unwrapping ---------------------------------------------------
/**
 * ### Unwrap Success
 *
 * Unwrap the success value from a success result. The typescript compiler
 * will not allow to call this method until we check if the result is a
 * success.
 *
 * @example
 * ```ts
 * const result: Result<unknown, unknown> = ...;
 * if (Result.isSuccess(result)) {
 *   // Now it is safe to unwrap the success value and typescript compiler
 *   // will not complain about it.
 *   const successValue = Result.unwrap(result);
 *   ...
 * }
 * ```
 */
function unwrap<S>(result: Success<S>): S {
  return result[successTag];
}
/**
 * ### Unsafe success unwrap
 *
 * Unwrap a success value from a result which we do not know if it is a
 * success or a failure. If the result is a failure, an error is thrown.
 * This method is mostly used in test, where we don't want to bloat the
 * code with type checks because we control the constructs we create and test.
 *
 * @throws {TypeError}
 * @example
 * ```ts
 * const result = Result.success('Success value');
 * const successValue = Result.unsafeUnwrap(result);
 * // successValue is 'Success value'
 * ```
 */
function unsafeUnwrap<S, F>(result: Result<S, F>): S {
  if (isSuccess(result)) {
    return result[successTag];
  }
  throw new TypeError("Cannot unwrap a failure result");
}
/**
 * ### Unwrap Failure
 * Safely unwrap the failure value from a failed result. The typescript compiler
 * will not allow to call this method until we check if the result is a failure.
 *
 * @example
 *
 * ```ts
 * const result: Result<unknown, unknown> = ...;
 * if (Result.isFailure(result)) {
 *   // Now it is safe to unwrap the failure value and typescript compiler
 *   // will not complain about it.
 *   const failureValue = Result.unwrapFailure(result);
 *   ...
 * }
 * ```
 */
function unwrapFailure<F>(result: Failure<F>): F {
  return result[failureTag];
}
/**
 * ### Unsafe Unwrap Failure
 *
 * Attempt to unwrap a failure value from a result which we do not know if it is
 * a success or a failure. If the result is a success, an error is thrown. This
 * method is mostly used in test, where we don't want to bloat the code with
 * type checks because we control the constructs we create and test.
 *
 * @throws {TypeError}
 *
 * @example
 * ```ts
 * const result = Result.failure('Error occurred');
 * const failureValue = Result.unsafeUnwrapFailure(result);
 * // failureValue is 'Error occurred'
 * ```
 */
function unsafeUnwrapFailure<S, F>(result: Result<S, F>): F {
  if (isFailure(result)) {
    return result[failureTag];
  }
  throw new TypeError("Cannot unwrap a success result");
}
// #endregion Result unwrapping
// #region Result to Void ------------------------------------------------------
/**
 * ### Success to Void
 *
 * Map the success value of the result to a void value. If the result is a failure,
 * the failure value is returned as is.
 *
 * @example
 * ```ts
 * const result = Result.success(42);
 * const voidResult = Result.mapToVoid(result);
 * // voidResult is Result.success(void 0)
 * ```
 */
function toVoid<S, F>(result: Result<S, F>): Result<void, F> {
  return match(result, { onSuccess: () => void 0 });
}
// #endregion Result to Void
/**
 * Take the success value of the result and convert it into a failure value.
 * If the result is a failure, the failure value is returned as is.
 *
 * @param result
 * @returns
 */
function transformToFailure<S, F>(result: Result<S, F>): Result<never, S | F> {
  if (isSuccess(result)) {
    const value = unwrap(result) as S;
    return failure(value);
  }

  return result;
}
/**
 * Take the failure value of the result and convert it into a success value.
 * If the result is a success, the success value is returned as is.
 *
 * @param result
 * @param fn
 * @returns
 */
function transformToSuccess<S, F>(result: Result<S, F>): Result<S | F, never> {
  if (isFailure(result)) {
    const value = unwrapFailure(result) as F;
    return success(value);
  }

  return result;
}
// #region Result matchers -----------------------------------------------------
/**
 * ### Match the result success
 *
 * Match the success. If the result is a success, the `onSuccess` function is
 * called and the result is transformed into a success of whatever type the
 * `onSuccess` function returns.
 *
 * @example
 *
 * ```ts
 * const result = Result.success(42);
 * const matched = Result.match(result, {
 *   onSuccess: (value) => value + 1,
 * });
 * // matched is Result.success(43)
 * ```
 */
function match<S, F, MS>(
  result: Result<S, F>,
  matcher: {
    onSuccess: (value: S) => MS;
  },
): Result<MS, F>;
/**
 * ### Match the result failure
 *
 * Match the failure. If the result is a failure, the `onFailure` function is
 * called and the result is transformed into a failure of whatever type the
 * `onFailure` function returns.
 *
 * @example
 *
 * ```ts
 * const result = Result.failure('Error occurred');
 * const matched = Result.match(result, {
 *  onFailure: (value) => `Failure: ${value}`,
 * });
 * // matched is Result.failure('Failure: Error occurred')
 * ```
 */
function match<S, F, MF>(
  result: Result<S, F>,
  matcher: {
    onFailure: (value: F) => MF;
  },
): Result<S, MF>;
/**
 * ### Match the result success and failure (both)
 *
 * Match both success and failure. If the result is a success, the `onSuccess`
 * function is called and the result is transformed into a success of whatever
 * type the `onSuccess` function returns. If the result is a failure, the `onFailure`
 * function is called and the result is transformed into a failure of whatever
 * type the `onFailure` function returns.
 *
 * @example
 *
 * ```ts
 * const result = Result.success(42);
 * const matched = Result.match(result, {
 *   onSuccess: (value) => value + 1,
 *  onFailure: (value) => `Failure: ${value}`,
 * });
 * ```
 */
function match<S, F, MS, MF>(
  result: Result<S, F>,
  matcher: {
    onSuccess: (value: S) => MS;
    onFailure: (value: S) => MF;
  },
): Result<MS, MF>;
function match(
  result: Result<unknown, unknown>,
  matcher: {
    onSuccess?: (value: unknown) => unknown;
    onFailure?: (value: unknown) => unknown;
  },
): Result<unknown, unknown> {
  if (isSuccess(result)) {
    return matcher.onSuccess
      ? success(matcher.onSuccess(unwrap(result)))
      : result;
  } else if (isFailure(result)) {
    return matcher.onFailure
      ? failure(matcher.onFailure(unwrapFailure(result)))
      : result;
  }
  // Ignore this path because the typescript compiler should prevent us
  // to reach this point in runtime at the first place.
  /* istanbul ignore next */
  throw new ExhaustivePatternCheckError(result);
}
// #endregion Result matchers

// #region IS ------------------------------------------------------------------
/**
 * Check if the value is any type of a result.
 */
function is(value: unknown): value is Result<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (successTag in value || failureTag in value)
  );
}
// #endregion IS

// #region Assertions ----------------------------------------------------------
/**
 * Use assertion to check the result type in the flow where you do not use
 * branching logic to check the result type. This assertion is unsafe because
 * it interrupts the flow if the result is not a success by throwing the
 * failure value as an error.
 *
 * @example
 *
 * ```ts
 * const result: Result<unknown, string> = ...;
 * Result.assertSuccess(result);
 * // Now it is safe to unwrap the success value and typescript compiler
 * // will not complain about it.
 * const successValue = Result.unwrap(result);
 * ```
 *
 * @throws {Failure<F>} If the result is a failure, the failure value is
 *    thrown as an error.
 */
function assertSuccess<S, F>(
  result: Result<S, F>,
): asserts result is Success<S> {
  if (!isSuccess(result)) {
    throw Result.unwrapFailure(result);
  }
}
/**
 * Use assertion to check the result type in the flow where you do not use
 * branching logic to check the result type. This assertion is unsafe because
 * it interrupts the flow if the result is not a failure by throwing an error.
 *
 * @example
 *
 * ```ts
 * const result: Result<unknown, string> = ...;
 * Result.assertFailure(result);
 * // Now it is safe to unwrap the failure value and typescript compiler
 * // will not complain about it.
 * const failureValue = Result.unwrapFailure(result);
 * ```
 *
 * @throws {TypeError} If the result is a success, a TypeError is thrown.
 */
function assertFailure<S, F>(
  result: Result<S, F>,
  message?: string,
): asserts result is Failure<F> {
  if (!isFailure(result)) {
    throw new TypeError(
      message ?? "Expected a failure result, but got a success result",
    );
  }
}
// #endregion Assertions

// MARK: Result Type -----------------------------------------------------------
type ResultStatic = {
  failure: typeof failure;
  is: typeof is;
  isFailure: typeof isFailure;
  isSuccess: typeof isSuccess;
  mapToVoid: typeof toVoid;
  success: typeof success;
  transformToFailure: typeof transformToFailure;
  transformToSuccess: typeof transformToSuccess;
  unsafeUnwrap: typeof unsafeUnwrap;
  unwrap: typeof unwrap;
  unwrapFailure: typeof unwrapFailure;
  unsafeUnwrapFailure: typeof unsafeUnwrapFailure;
  assertSuccess: typeof assertSuccess;
  assertFailure: typeof assertFailure;
  match: typeof match;
};

export const Result: ResultStatic = {
  failure,
  is,
  isFailure,
  isSuccess,
  mapToVoid: toVoid,
  success,
  transformToFailure,
  transformToSuccess,
  unsafeUnwrap,
  unwrap,
  unwrapFailure,
  unsafeUnwrapFailure,
  assertSuccess,
  assertFailure,

  match,
};
