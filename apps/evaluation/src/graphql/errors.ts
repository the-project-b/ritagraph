import { GraphQLError } from "graphql";

/**
 * Centralized GraphQL error definitions
 */
export const GraphQLErrors = {
  UNAUTHENTICATED: new GraphQLError("Authentication required", {
    extensions: { code: "UNAUTHENTICATED" },
  }),

  UNAUTHORIZED: new GraphQLError("Insufficient permissions", {
    extensions: { code: "FORBIDDEN" },
  }),

  INVALID_INPUT: (message: string) =>
    new GraphQLError(`Invalid input: ${message}`, {
      extensions: { code: "BAD_USER_INPUT" },
    }),

  NOT_FOUND: (resource: string) =>
    new GraphQLError(`${resource} not found`, {
      extensions: { code: "NOT_FOUND" },
    }),

  INTERNAL_ERROR: (message?: string) =>
    new GraphQLError(message || "Internal server error", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    }),

  RATE_LIMITED: new GraphQLError("Rate limit exceeded", {
    extensions: { code: "RATE_LIMITED" },
  }),

  SERVICE_UNAVAILABLE: (service: string) =>
    new GraphQLError(`${service} service is currently unavailable`, {
      extensions: { code: "SERVICE_UNAVAILABLE" },
    }),
} as const;
