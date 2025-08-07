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

export interface Me {
  preferredLanguage: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface VerifiedUser {
  auth0: Auth0User;
  aclRole: string;
  companies: CompanyUser[];
  token: string;
  me: Me;
}

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
