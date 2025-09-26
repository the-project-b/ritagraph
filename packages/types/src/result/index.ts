/**
 * Result pattern exports
 */

// Core functional API
export {
  Result,
  Ok,
  Err,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  flatMap,
  flatMapErr,
  mapAsync,
  flatMapAsync,
  all,
  allSettled,
  match,
  tryCatch,
  tryCatchAsync,
  validate,
  validateAll,
  fromNullable,
  toNullable,
  tap,
  tapErr,
} from "./result.js";

// Class-based API
export { Result as ResultClass } from "./result-class.js";

// Error types
export {
  BaseError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  ApplicationError,
  BusinessRuleViolationError,
  ConcurrencyError,
  RateLimitError,
  InfrastructureError,
  PersistenceError,
  ExternalServiceError,
  NetworkError,
  TimeoutError,
  ErrorFactory,
  isBaseError,
  isDomainError,
  isApplicationError,
  isInfrastructureError,
} from "./errors.js";

// Re-export common patterns as namespace for convenience
export * as R from "./result.js";
export * as Errors from "./errors.js";
