import { ME_QUERY } from '../graphql/queries.js';
import { Auth0UserResponse, AuthError, Me, UserToCompaniesResponse, VerifiedUser } from './types.js';

export class AuthService {
  private readonly graphqlEndpoint: string;

  constructor(graphqlEndpoint?: string) {
    const baseEndpoint = graphqlEndpoint || process.env.PROJECTB_GRAPHQL_ENDPOINT || 'http://localhost:3000';
    this.graphqlEndpoint = this.ensureGraphQLApiPath(baseEndpoint);
  }

  /**
   * Ensures the GraphQL endpoint has the /graphqlapi path properly appended
   * @param endpoint - The base GraphQL endpoint URL  
   * @returns string - The endpoint with /graphqlapi path
   */
  private ensureGraphQLApiPath(endpoint: string): string {
    // Remove trailing slash if present
    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    
    // Check if already ends with /graphqlapi
    if (cleanEndpoint.endsWith('/graphqlapi')) {
      return cleanEndpoint;
    }
    
    // Add /graphqlapi path
    return `${cleanEndpoint}/graphqlapi`;
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

      // Then, get the user's preferred language
      const me = await this.getMe(token);

      const verifiedUser = {
        auth0: auth0User,
        aclRole: userCompanies.role,
        companies: userCompanies.companies,
        token,
        me,
      };
      
      return verifiedUser;
    } catch (error) {
      console.error('[AuthService] Token verification failed', error instanceof Error ? error.message : 'Unknown error');
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
      await response.text(); // Consume response body
      console.error(`[AuthService] Auth0 GraphQL request failed: ${response.status} ${response.statusText}`);
      throw new Error(`Auth0 verification failed: ${response.status} ${response.statusText}`);
    }

    const data: Auth0UserResponse = await response.json();
    
    if (!data.data?.authUser) {
      console.error('[AuthService] Invalid Auth0 user response structure');
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
      await response.text(); // Consume response body
      console.error(`[AuthService] UserToCompanies GraphQL request failed: ${response.status} ${response.statusText}`);
      throw new Error(`ACL data fetch failed: ${response.status} ${response.statusText}`);
    }

    const data: UserToCompaniesResponse = await response.json();
    
    if (!data.data?.userToCompanies || !Array.isArray(data.data.userToCompanies) || data.data.userToCompanies.length === 0) {
      console.error('[AuthService] Invalid user companies response structure');
      throw new Error('Invalid user companies response');
    }

    // Take the first element from the userToCompanies array
    const userCompaniesData = data.data.userToCompanies[0];
    return userCompaniesData;
  }

  private async getMe(token: string): Promise<Me> {
    const query = ME_QUERY;

    const response = await this.makeGraphQLRequest(query, token);
    
    if (!response.ok) {
      await response.text(); // Consume response body
      console.error(`[AuthService] User details GraphQL request failed: ${response.status} ${response.statusText}`);
      throw new Error(`User details fetch failed: ${response.status} ${response.statusText}`);
    }

    const data: {data: {me: Me}} = await response.json();

    if (!data.data.me) {
      console.error('[AuthService] Invalid user information response structure');
      throw new Error('Invalid user information response');
    }

    return data.data.me;
  }

  /**
   * Makes a GraphQL request to the backend
   * @param query - The GraphQL query string
   * @param token - The bearer token
   * @returns Promise<Response> - The fetch response
   */
  private async makeGraphQLRequest(query: string, token: string): Promise<Response> {
    const url = `${this.graphqlEndpoint}`;
    
    const request = {
      method: 'POST',
      headers: {
        'Authorization': `${token}`,
        'Cookie': `accessToken=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: query.toString() }),
    };
    
    try {
      const response = await fetch(url, request);
      return response;
    } catch (error) {
      console.error('[AuthService] GraphQL request failed:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
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