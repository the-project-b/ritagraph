/**
 * @ritagraph/graphql-client - Shared GraphQL client and queries for RitaGraph applications
 * 
 * This package contains the shared GraphQL client, queries, and fragments used across
 * the RitaGraph monorepo, ensuring consistency and eliminating duplication.
 */

// Re-export the client
export * from './client.js';

// Re-export all queries and fragments
export * from './queries.js';

// Re-export types from the types package for convenience
export type {
  MeResponse,
  Employee,
  EmployeeContract,
  EmployeesByCompanyResponse,
  EmployeesByCompanyInput
} from '@ritagraph/types';