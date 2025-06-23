import { graphqlClient } from "./graphql-client";
import {
  ME_QUERY,
  MeResponse,
  EMPLOYEES_BY_COMPANY_QUERY,
  EmployeesByCompanyResponse,
  EmployeesByCompanyInput,
} from "./graphql-queries";
import { PlaceholderContext } from "../placeholders/types.js";

/**
 * User service that caches user data to avoid duplicate GraphQL requests
 * when multiple placeholders need user information
 */
class UserService {
  private cache = new Map<string, { data: MeResponse; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate a cache key based on the access token
   */
  private getCacheKey(context: PlaceholderContext): string {
    // Extract access token for cache key
    const authUser =
      (context.config as any)?.user ||
      (context.config as any)?.langgraph_auth_user ||
      ((context.config as any)?.configurable &&
        (context.config as any).configurable.langgraph_auth_user);
    const authAccessToken = authUser?.token;
    const accessToken = context.state.accessToken || authAccessToken;

    return accessToken ? `user_${accessToken.slice(-10)}` : "anonymous";
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_TTL;
  }

  /**
   * Get user data, using cache if available and valid
   */
  private async getUserData(context: PlaceholderContext): Promise<MeResponse> {
    const cacheKey = this.getCacheKey(context);
    const cached = this.cache.get(cacheKey);

    // Return cached data if valid
    if (cached && this.isCacheValid(cached.timestamp)) {
      console.log("UserService: Using cached user data");
      return cached.data;
    }

    // Fetch fresh data
    console.log("UserService: Fetching fresh user data");
    try {
      const response = await graphqlClient.request<MeResponse>(
        ME_QUERY,
        {},
        context
      );

      // Cache the response
      this.cache.set(cacheKey, {
        data: response,
        timestamp: Date.now(),
      });

      return response;
    } catch (error) {
      console.warn("UserService: Failed to fetch user data:", error.message);

      // Return cached data even if expired, as fallback
      if (cached) {
        console.log("UserService: Using expired cache as fallback");
        return cached.data;
      }

      throw error;
    }
  }

  /**
   * Get user's full name
   */
  async getUserName(context: PlaceholderContext): Promise<string> {
    try {
      const userData = await this.getUserData(context);
      return `${userData.me.firstName} ${userData.me.lastName}`;
    } catch (error) {
      console.warn("UserService: Failed to get username, using fallback");
      return "John Doe";
    }
  }

  /**
   * Get user's company name
   */
  async getCompanyName(context: PlaceholderContext): Promise<string> {
    try {
      const userData = await this.getUserData(context);
      return userData.me.company.name;
    } catch (error) {
      console.warn("UserService: Failed to get company name, using fallback");
      return "Your Company";
    }
  }

  /**
   * Get user's company id
   */
  async getCompanyId(context: PlaceholderContext): Promise<string> {
    try {
      const userData = await this.getUserData(context);
      return userData.me.company.id;
    } catch (error) {
      console.warn("UserService: Failed to get company id, using fallback");
      return "companyclient4";
    }
  }

  /**
   * Get user's email
   */
  async getUserEmail(context: PlaceholderContext): Promise<string> {
    try {
      const userData = await this.getUserData(context);
      return userData.me.email;
    } catch (error) {
      console.warn("UserService: Failed to get user email, using fallback");
      return "user@example.com";
    }
  }

  /**
   * Get user's role
   */
  async getUserRole(context: PlaceholderContext): Promise<string> {
    try {
      const userData = await this.getUserData(context);
      return userData.me.role;
    } catch (error) {
      console.warn("UserService: Failed to get user role, using fallback");
      return "user";
    }
  }

  /**
   * Get user's language
   */
  async getUserLanguage(context: PlaceholderContext): Promise<string> {
    try {
      const userData = await this.getUserData(context);
      return userData.me.preferredLanguage;
    } catch (error) {
      console.warn("UserService: Failed to get user language, using fallback");
      return "en";
    }
  }

  /**
   * Get contract IDs for employees in user's company
   */
  async getContractIds(context: PlaceholderContext): Promise<string[]> {
    try {
      const userData = await this.getUserData(context);
      const companyId = userData.me.company.id;

      console.log("UserService: Fetching employees for company:", companyId);

      const response = await graphqlClient.request<EmployeesByCompanyResponse>(
        EMPLOYEES_BY_COMPANY_QUERY,
        { data: { companyId } },
        context
      );

      const contractIds: string[] = [];

      // Extract contract IDs from all employees and their contracts
      response.employeesByCompany.forEach((employee) => {
        if (
          employee.employeeContract &&
          Array.isArray(employee.employeeContract)
        ) {
          employee.employeeContract.forEach((contract) => {
            if (contract.id) {
              contractIds.push(contract.id);
            }
          });
        }
      });

      console.log("UserService: Found contract IDs:", contractIds);
      return contractIds;
    } catch (error) {
      console.warn("UserService: Failed to get contract IDs:", error.message);
      return [];
    }
  }

  /**
   * Get full user data (useful for complex placeholders that need multiple fields)
   */
  async getFullUserData(context: PlaceholderContext): Promise<MeResponse> {
    return await this.getUserData(context);
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clear cache (useful for testing or when user data changes)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (!this.isCacheValid(value.timestamp)) {
        this.cache.delete(key);
      }
    }
  }
}

// Export a singleton instance
export const userService = new UserService();
