/**
 * Authentication and user types for Rita graph
 * These types should match the backend implementation exactly
 */

// UserRole enum to match backend exactly
export enum UserRole {
  ADMIN = "ADMIN",
  EMPLOYEE = "EMPLOYEE",
  HRMANAGER = "HRMANAGER",
  HR = "HR",
  BPO = "BPO",
}

// UserAccessGrant type to match backend UserAccessGrant structure
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

// ViewAsValue type to match backend auth.types.ts exactly
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

// Rita graph specific user types
export interface AuthUser {
  identity: string;
  role: string;
  token: string;
  permissions: string[];
  appdataHeader: string;
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
