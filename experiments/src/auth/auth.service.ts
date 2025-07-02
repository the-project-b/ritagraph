import { Auth0UserResponse, UserToCompaniesResponse, VerifiedUser, AuthError } from './types.js';

export class AuthService {
  private readonly graphqlEndpoint: string;

  constructor(graphqlEndpoint?: string) {
    this.graphqlEndpoint = graphqlEndpoint || process.env.PROJECTB_GRAPHQL_ENDPOINT || 'http://localhost:3000';
    console.log(`🚀 [AuthService] Initialized with GraphQL endpoint: ${this.graphqlEndpoint}`);
  }

  /**
   * Verifies a bearer token by making requests to the backend GraphQL API
   * @param token - The bearer token to verify
   * @returns Promise<VerifiedUser> - The verified user data
   * @throws AuthError - If token is invalid or requests fail
   */
  async verifyToken(token: string): Promise<VerifiedUser> {
    const tokenId = token.substring(0, 8) + '...';
    console.log(`🔍 [AuthService] Starting token verification for token: ${tokenId}`);
    
    try {
      // First, verify the token and get Auth0 user data
      console.log(`🔍 [AuthService] Step 1: Verifying Auth0 token...`);
      const auth0User = await this.getAuth0User(token);
      console.log(`✅ [AuthService] Auth0 verification successful for user: ${auth0User.id}`);
      
      // Then, get ACL roles and company associations
      console.log(`🔍 [AuthService] Step 2: Fetching ACL roles and company data...`);
      const userCompanies = await this.getUserToCompanies(token);
      console.log(`✅ [AuthService] ACL data fetched successfully, primary role: ${userCompanies.role}, companies: ${userCompanies.companies.length}`);

      const verifiedUser = {
        auth0: auth0User,
        aclRole: userCompanies.role,
        companies: userCompanies.companies,
        token,
      };
      
      console.log(`🎉 [AuthService] Token verification completed successfully for user: ${auth0User.id}`);
      return verifiedUser;
    } catch (error) {
      console.error(`❌ [AuthService] Token verification failed for token: ${tokenId}`, error);
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
    console.log(`📡 [AuthService] Making authUser GraphQL request to ${this.graphqlEndpoint}`);
    
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
    
    console.log(`📡 [AuthService] Auth0 GraphQL response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [AuthService] Auth0 GraphQL request failed:`, errorText);
      throw new Error(`Auth0 verification failed: ${response.status} ${response.statusText}`);
    }

    const data: Auth0UserResponse = await response.json();
    console.log(`📄 [AuthService] Auth0 response data:`, JSON.stringify(data, null, 2));
    
    if (!data.data?.authUser) {
      console.error(`❌ [AuthService] Invalid Auth0 user response structure`);
      throw new Error('Invalid Auth0 user response');
    }

    console.log(`✅ [AuthService] Auth0 user data retrieved for: ${data.data.authUser.id}`);
    return data.data.authUser;
  }

  /**
   * Gets user's ACL roles and company associations
   * @param token - The bearer token
   * @returns Promise<{ role: string; companies: CompanyUser[] }> - User's ACL data
   */
  private async getUserToCompanies(token: string) {
    console.log(`📡 [AuthService] Making userToCompanies GraphQL request to ${this.graphqlEndpoint}`);
    
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
    
    console.log(`📡 [AuthService] UserToCompanies GraphQL response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [AuthService] UserToCompanies GraphQL request failed:`, errorText);
      throw new Error(`ACL data fetch failed: ${response.status} ${response.statusText}`);
    }

    const data: UserToCompaniesResponse = await response.json();
    console.log(`📄 [AuthService] UserToCompanies response data:`, JSON.stringify(data, null, 2));
    
    if (!data.data?.userToCompanies) {
      console.error(`❌ [AuthService] Invalid user companies response structure`);
      throw new Error('Invalid user companies response');
    }

    console.log(`✅ [AuthService] User companies data retrieved: ${data.data.userToCompanies.companies.length} companies, primary role: ${data.data.userToCompanies.role}`);
    return data.data.userToCompanies;
  }

  /**
   * Makes a GraphQL request to the backend
   * @param query - The GraphQL query string
   * @param token - The bearer token
   * @returns Promise<Response> - The fetch response
   */
  private async makeGraphQLRequest(query: string, token: string): Promise<Response> {
    const url = `${this.graphqlEndpoint}/graphqlapi`;
    const tokenId = token.substring(0, 8) + '...';
    
    console.log(`🌐 [AuthService] Making GraphQL request to: ${url}`);
    console.log(`🌐 [AuthService] Using token: ${tokenId}`);
    console.log(`🌐 [AuthService] Query:`, query.trim());
    
    const requestStart = Date.now();
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      const requestTime = Date.now() - requestStart;
      console.log(`⚡ [AuthService] GraphQL request completed in ${requestTime}ms`);
      
      return response;
    } catch (error) {
      const requestTime = Date.now() - requestStart;
      console.error(`💥 [AuthService] GraphQL request failed after ${requestTime}ms:`, error);
      throw error;
    }
  }

  /**
   * Extracts bearer token from authorization header
   * @param authHeader - The authorization header value
   * @returns string | null - The extracted token or null if invalid
   */
  static extractBearerToken(authHeader: string | undefined): string | null {
    console.log(`🔍 [AuthService] Extracting bearer token from header:`, authHeader ? `${authHeader.substring(0, 20)}...` : 'undefined');
    
    if (!authHeader || typeof authHeader !== 'string') {
      console.log(`❌ [AuthService] Invalid auth header: ${typeof authHeader}`);
      return null;
    }

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      console.log(`❌ [AuthService] Auth header doesn't start with 'Bearer '`);
      return null;
    }

    const token = authHeader.slice(7).trim();
    const isValid = token.length > 0;
    
    console.log(`${isValid ? '✅' : '❌'} [AuthService] Token extraction ${isValid ? 'successful' : 'failed'}, length: ${token.length}`);
    
    return isValid ? token : null;
  }
} 