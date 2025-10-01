/**
 * Utility types and helpers
 */

// Type utilities
export type {
  Nullable,
  Optional,
  Maybe,
  Awaitable,
  DeepPartial,
  DeepReadonly,
  DeepRequired,
  ValueOf,
  RequireAtLeastOne,
  RequireOnlyOne,
  Entries,
  Keys,
  Values,
  Prettify,
  Mutable,
  PartialBy,
  RequiredBy,
} from "./types.js";

// Common domain types
export type {
  UUID,
  Email,
  ISODateString,
  Timestamp,
  NonEmptyString,
  URL,
  JSONString,
  PositiveNumber,
  NonNegativeNumber,
  Integer,
  Percentage,
} from "./common.js";

// Type guards and validators
export {
  isUUID,
  asUUID,
  isEmail,
  asEmail,
  isISODateString,
  asISODateString,
  isNonEmptyString,
  asNonEmptyString,
  isURL,
  asURL,
  isJSONString,
  asJSONString,
  isPositiveNumber,
  asPositiveNumber,
  isNonNegativeNumber,
  asNonNegativeNumber,
  isInteger,
  asInteger,
  isPercentage,
  asPercentage,
} from "./guards.js";
