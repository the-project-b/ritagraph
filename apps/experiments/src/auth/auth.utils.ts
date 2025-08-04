import { VerifiedUser, CompanyUser } from './types.js';

/**
 * Auth utility functions for role and permission checking
 */
export class AuthUtils {
  
  /**
   * Checks if user has a specific Auth0 role
   * @param user - The verified user
   * @param role - The Auth0 role to check for
   * @returns boolean
   */
  static hasAuth0Role(user: VerifiedUser, role: string): boolean {
    return user.auth0.roles.includes(role);
  }

  /**
   * Checks if user has any of the specified Auth0 roles
   * @param user - The verified user
   * @param roles - Array of Auth0 roles to check for
   * @returns boolean
   */
  static hasAnyAuth0Role(user: VerifiedUser, roles: string[]): boolean {
    return roles.some(role => this.hasAuth0Role(user, role));
  }

  /**
   * Checks if user has a specific Auth0 permission
   * @param user - The verified user
   * @param permission - The Auth0 permission to check for
   * @returns boolean
   */
  static hasAuth0Permission(user: VerifiedUser, permission: string): boolean {
    return user.auth0.permissions.includes(permission);
  }

  /**
   * Checks if user has any of the specified Auth0 permissions
   * @param user - The verified user
   * @param permissions - Array of Auth0 permissions to check for
   * @returns boolean
   */
  static hasAnyAuth0Permission(user: VerifiedUser, permissions: string[]): boolean {
    return permissions.some(permission => this.hasAuth0Permission(user, permission));
  }

  /**
   * Checks if user has a specific ACL role (primary role)
   * @param user - The verified user
   * @param aclRole - The ACL role to check for
   * @returns boolean
   */
  static hasACLRole(user: VerifiedUser, aclRole: string): boolean {
    return user.aclRole === aclRole;
  }

  /**
   * Checks if user has any of the specified ACL roles (primary role)
   * @param user - The verified user
   * @param aclRoles - Array of ACL roles to check for
   * @returns boolean
   */
  static hasAnyACLRole(user: VerifiedUser, aclRoles: string[]): boolean {
    return aclRoles.includes(user.aclRole);
  }

  /**
   * Checks if user has access to a specific company
   * @param user - The verified user
   * @param companyId - The company ID to check for
   * @returns boolean
   */
  static hasAccessToCompany(user: VerifiedUser, companyId: string): boolean {
    return user.companies.some(company => company.companyId === companyId);
  }

  /**
   * Gets user's role within a specific company
   * @param user - The verified user
   * @param companyId - The company ID
   * @returns string | null - The role within the company or null if no access
   */
  static getUserRoleInCompany(user: VerifiedUser, companyId: string): string | null {
    const company = user.companies.find(company => company.companyId === companyId);
    return company?.role || null;
  }

  /**
   * Checks if user has a specific role within a company
   * @param user - The verified user
   * @param companyId - The company ID
   * @param role - The role to check for within the company
   * @returns boolean
   */
  static hasRoleInCompany(user: VerifiedUser, companyId: string, role: string): boolean {
    const userRole = this.getUserRoleInCompany(user, companyId);
    return userRole === role;
  }

  /**
   * Checks if user is managing a specific company
   * @param user - The verified user
   * @param companyId - The company ID
   * @returns boolean
   */
  static isManagingCompany(user: VerifiedUser, companyId: string): boolean {
    const company = user.companies.find(company => company.companyId === companyId);
    return company?.managingCompany || false;
  }

  /**
   * Gets all companies the user has access to
   * @param user - The verified user
   * @returns CompanyUser[] - Array of companies user has access to
   */
  static getUserCompanies(user: VerifiedUser): CompanyUser[] {
    return user.companies;
  }

  /**
   * Gets companies where user has a specific role
   * @param user - The verified user
   * @param role - The role to filter by
   * @returns CompanyUser[] - Array of companies where user has the specified role
   */
  static getCompaniesByRole(user: VerifiedUser, role: string): CompanyUser[] {
    return user.companies.filter(company => company.role === role);
  }

  /**
   * Gets companies that the user is managing
   * @param user - The verified user
   * @returns CompanyUser[] - Array of companies user is managing
   */
  static getManagedCompanies(user: VerifiedUser): CompanyUser[] {
    return user.companies.filter(company => company.managingCompany);
  }

  /**
   * Checks if user is an admin (has admin role in Auth0 or ACL)
   * @param user - The verified user
   * @returns boolean
   */
  static isAdmin(user: VerifiedUser): boolean {
    const hasAuth0Admin = this.hasAuth0Role(user, 'admin');
    const hasACLAdmin = this.hasACLRole(user, 'ADMIN');
    return hasAuth0Admin || hasACLAdmin;
  }

  /**
   * Checks if user is a BPO admin
   * @param user - The verified user
   * @returns boolean
   */
  static isBPOAdmin(user: VerifiedUser): boolean {
    return this.hasAuth0Role(user, 'onboarding-bpo-admin') || 
           this.hasACLRole(user, 'BPO Admin');
  }

  /**
   * Gets user's full name
   * @param user - The verified user
   * @returns string - Full name from the first company record (they should be the same)
   */
  static getFullName(user: VerifiedUser): string {
    const company = user.companies[0];
    if (!company) return 'Unknown User';
    return `${company.firstName} ${company.lastName}`.trim();
  }

  /**
   * Gets user's email
   * @param user - The verified user
   * @returns string - Email from the first company record
   */
  static getEmail(user: VerifiedUser): string {
    const company = user.companies[0];
    return company?.email || '';
  }
} 