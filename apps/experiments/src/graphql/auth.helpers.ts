import { VerifiedUser } from '@ritagraph/types';
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
  console.log(`🔐 [AuthHelper] Checking authentication in resolver`);
  
  if (!context.user) {
    console.log(`❌ [AuthHelper] Authentication required but user not found in context`);
    throw GraphQLErrors.UNAUTHENTICATED;
  }
  
  console.log(`✅ [AuthHelper] User authenticated: ${context.user.auth0.id}`);
  return context.user;
}

/**
 * Ensures the user has admin privileges
 * @param context - The GraphQL context
 * @returns VerifiedUser - The authenticated admin user
 * @throws GraphQLError - If user is not authenticated or not an admin
 */
export function requireAdmin(context: GraphQLContext): VerifiedUser {
  console.log(`🔐 [AuthHelper] Checking admin privileges`);
  const user = requireAuth(context);
  
  if (!AuthUtils.isAdmin(user)) {
    console.log(`❌ [AuthHelper] Admin privileges required but user ${user.auth0.id} is not admin`);
    console.log(`👤 [AuthHelper] User roles - Auth0: ${user.auth0.roles.join(', ')}, ACL: ${user.aclRole}`);
    throw GraphQLErrors.UNAUTHORIZED;
  }
  
  console.log(`✅ [AuthHelper] Admin privileges confirmed for user: ${user.auth0.id}`);
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
  console.log(`🔐 [AuthHelper] Checking company access for company: ${companyId}`);
  const user = requireAuth(context);
  
  if (!AuthUtils.hasAccessToCompany(user, companyId)) {
    console.log(`❌ [AuthHelper] Company access denied for user ${user.auth0.id} to company ${companyId}`);
    console.log(`🏢 [AuthHelper] User has access to companies: ${user.companies.map(c => c.companyId).join(', ')}`);
    throw GraphQLErrors.UNAUTHORIZED;
  }
  
  console.log(`✅ [AuthHelper] Company access confirmed for user ${user.auth0.id} to company ${companyId}`);
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