import { VerifiedUser } from '../auth/types.js';
import { AuthUtils } from '../auth/auth.utils.js';
import { GraphQLErrors } from './errors.js';
import type { GraphQLContext } from '../types/context.js';

/**
 * Ensures the user is authenticated and returns the verified user
 * @param context - The GraphQL context
 * @returns VerifiedUser - The authenticated user
 * @throws GraphQLError - If user is not authenticated
 */
export function requireAuth(context: GraphQLContext): VerifiedUser {
  if (!context.user) {
    throw GraphQLErrors.UNAUTHENTICATED;
  }
  return context.user;
}

/**
 * Ensures the user has admin privileges
 * @param context - The GraphQL context
 * @returns VerifiedUser - The authenticated admin user
 * @throws GraphQLError - If user is not authenticated or not an admin
 */
export function requireAdmin(context: GraphQLContext): VerifiedUser {
  const user = requireAuth(context);
  
  if (!AuthUtils.isAdmin(user)) {
    throw GraphQLErrors.UNAUTHORIZED;
  }
  
  return user;
}

/**
 * Ensures the user has BPO admin privileges
 * @param context - The GraphQL context
 * @returns VerifiedUser - The authenticated BPO admin user
 * @throws GraphQLError - If user is not authenticated or not a BPO admin
 */
export function requireBPOAdmin(context: GraphQLContext): VerifiedUser {
  const user = requireAuth(context);
  
  if (!AuthUtils.isBPOAdmin(user)) {
    throw GraphQLErrors.UNAUTHORIZED;
  }
  
  return user;
}

/**
 * Ensures the user has any of the specified Auth0 roles
 * @param context - The GraphQL context
 * @param roles - Array of Auth0 roles to check for
 * @returns VerifiedUser - The authenticated user with required role
 * @throws GraphQLError - If user is not authenticated or doesn't have required role
 */
export function requireAuth0Role(context: GraphQLContext, roles: string[]): VerifiedUser {
  const user = requireAuth(context);
  
  if (!AuthUtils.hasAnyAuth0Role(user, roles)) {
    throw GraphQLErrors.UNAUTHORIZED;
  }
  
  return user;
}

/**
 * Ensures the user has any of the specified ACL roles
 * @param context - The GraphQL context
 * @param roles - Array of ACL roles to check for
 * @returns VerifiedUser - The authenticated user with required role
 * @throws GraphQLError - If user is not authenticated or doesn't have required role
 */
export function requireACLRole(context: GraphQLContext, roles: string[]): VerifiedUser {
  const user = requireAuth(context);
  
  if (!AuthUtils.hasAnyACLRole(user, roles)) {
    throw GraphQLErrors.UNAUTHORIZED;
  }
  
  return user;
}

/**
 * Ensures the user has access to a specific company
 * @param context - The GraphQL context
 * @param companyId - The company ID to check access for
 * @returns VerifiedUser - The authenticated user with company access
 * @throws GraphQLError - If user is not authenticated or doesn't have company access
 */
export function requireCompanyAccess(context: GraphQLContext, companyId: string): VerifiedUser {
  const user = requireAuth(context);
  
  if (!AuthUtils.hasAccessToCompany(user, companyId)) {
    throw GraphQLErrors.UNAUTHORIZED;
  }
  
  return user;
}

/**
 * Optionally gets the authenticated user (doesn't throw if not authenticated)
 * @param context - The GraphQL context
 * @returns VerifiedUser | null - The authenticated user or null if not authenticated
 */
export function getOptionalAuth(context: GraphQLContext): VerifiedUser | null {
  return context.user || null;
} 