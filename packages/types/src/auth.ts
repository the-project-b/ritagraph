/**
 * Authentication and authorization types shared across RitaGraph applications
 */

// UserRole enum - unified from both apps
export enum UserRole {
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
  HRMANAGER = 'HRMANAGER',
  HR = 'HR',
  BPO = 'BPO',
}

// Auth0 related types (from experiments)
export interface Auth0User {
  id: string;
  permissions: string[];
  roles: string[];
}

export interface Auth0UserResponse {
  data: {
    authUser: Auth0User;
  };
}

// User access and grants (from rita)
export interface UserAccessGrant {
  default: boolean;
  isDirect: boolean;
  userId: string;
  userRoleId: number;
  companyId: string;
  role: string;
  roleParentTitle?: string;
  permissions: Array<{ permission: string }>;
}

// ViewAs types (from rita)
export interface ViewAsValue {
  role: UserRole;
  originalRole: UserRole;
  userId: string;
  userRoleId: number;
  impersonationUserId?: string | null;
  companyId: string;
  originalCompanyId?: string;
  clientImpersonated: boolean;
  viewAs?: {
    original?: UserAccessGrant;
    wanted: UserAccessGrant;
    lastActive?: UserAccessGrant;
  };
}

// Company and user types (from experiments)
export interface CompanyUser {
  companyAvatarUrl: string | null;
  companyId: string;
  companyName: string;
  email: string;
  firstName: string;
  id: string;
  lastName: string;
  managingCompany: boolean;
  parentRoleName: string | null;
  role: string; // This will be an ACL role
  roleId: number;
  userAvatarUrl: string | null;
  userId: string;
}

export interface UserToCompaniesResponse {
  data: {
    userToCompanies: {
      companies: CompanyUser[];
      role: string; // Primary ACL role
    }[];
  };
}

// Basic user info (from experiments)
export interface Me {
  preferredLanguage: string;
  firstName: string;
  lastName: string;
  email: string;
}

// Verified user (from experiments)
export interface VerifiedUser {
  auth0: Auth0User;
  aclRole: string;
  companies: CompanyUser[];
  token: string;
  me: Me;
}

// Rita graph specific user types (from rita)
export interface AuthUser {
  identity: string;
  role: string;
  token: string;
  permissions: string[];
  user: {
    id: string;
    role: string;
    firstName: string;
    lastName: string;
    preferredLanguage: "EN" | "DE";
    company: {
      id: string;
      name: string;
    };
  };
}

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}