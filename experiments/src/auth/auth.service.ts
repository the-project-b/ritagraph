import { Auth0UserResponse, UserToCompaniesResponse, VerifiedUser, AuthError } from './types.js';

export class AuthService {
  private readonly graphqlEndpoint: string;

  constructor(graphqlEndpoint?: string) {
    this.graphqlEndpoint = graphqlEndpoint || process.env.PROJECTB_GRAPHQL_ENDPOINT || 'http://localhost:3000';
  }

  /**
   * Verifies a bearer token by making requests to the backend GraphQL API
   * @param token - The bearer token to verify
   * @returns Promise<VerifiedUser> - The verified user data
   * @throws AuthError - If token is invalid or requests fail
   */
  async verifyToken(token: string): Promise<VerifiedUser> {
    try {
      // First, verify the token and get Auth0 user data
      const auth0User = await this.getAuth0User(token);
      
      // Then, get ACL roles and company associations
      const userCompanies = await this.getUserToCompanies(token);

      return {
        auth0: auth0User,
        aclRole: userCompanies.role,
        companies: userCompanies.companies,
        token,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new AuthError(`Token verification failed: ${error.message}`, 401);
      }
      throw new AuthError('Token verification failed: Unknown error', 500);
    }
  }

  /**
   * Gets Auth0 user information to verify token validity
   * @param token - The bearer token
   * @returns Promise<Auth0User> - The Auth0 user data
   */
  private async getAuth0User(token: string) {
    const query = `
      query GetAuthUser {
        authUser {
          id
          permissions
          roles
        }
      }
    `;

    const response = await this.makeGraphQLRequest(query, token);
    
    if (!response.ok) {
      throw new Error(`Auth0 verification failed: ${response.status} ${response.statusText}`);
    }

    const data: Auth0UserResponse = await response.json();
    
    if (!data.data?.authUser) {
      throw new Error('Invalid Auth0 user response');
    }

    return data.data.authUser;
  }

  /**
   * Gets user's ACL roles and company associations
   * @param token - The bearer token
   * @returns Promise<{ role: string; companies: CompanyUser[] }> - User's ACL data
   */
  private async getUserToCompanies(token: string) {
    const query = `
      query GetUserToCompanies {
        userToCompanies {
          companies {
            companyAvatarUrl
            companyId
            companyName
            email
            firstName
            id
            lastName
            managingCompany
            parentRoleName
            role
            roleId
            userAvatarUrl
            userId
          }
          role
        }
      }
    `;

    const response = await this.makeGraphQLRequest(query, token);
    
    if (!response.ok) {
      throw new Error(`ACL data fetch failed: ${response.status} ${response.statusText}`);
    }

    const data: UserToCompaniesResponse = await response.json();
    
    if (!data.data?.userToCompanies) {
      throw new Error('Invalid user companies response');
    }

    return data.data.userToCompanies;
  }

  /**
   * Makes a GraphQL request to the backend
   * @param query - The GraphQL query string
   * @param token - The bearer token
   * @returns Promise<Response> - The fetch response
   */
  private async makeGraphQLRequest(query: string, token: string): Promise<Response> {
    return fetch(`${this.graphqlEndpoint}/graphqlapi`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
  }

  /**
   * Extracts bearer token from authorization header
   * @param authHeader - The authorization header value
   * @returns string | null - The extracted token or null if invalid
   */
  static extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    const token = authHeader.slice(7).trim();
    return token.length > 0 ? token : null;
  }
} 