import { request, RequestDocument, Variables } from "graphql-request";

interface GraphQLClientContext {
  state?: {
    accessToken?: string;
  };
  config?: any;
}

/**
 * Extracts access token from context using the same logic as nodes
 */
function extractAccessToken(context: GraphQLClientContext): string | undefined {
  // Priority: 1. State accessToken, 2. Auth token from config
  const authUser =
    (context.config as any)?.user ||
    (context.config as any)?.langgraph_auth_user ||
    ((context.config as any)?.configurable &&
      (context.config as any).configurable.langgraph_auth_user);
  const authAccessToken = authUser?.token;

  // Use state accessToken if available, otherwise fall back to auth token
  return context.state?.accessToken || authAccessToken;
}

/**
 * Reusable GraphQL client for making authenticated requests
 */
export class ProjectBGraphQLClient {
  private endpoint: string;

  constructor(endpoint?: string) {
    this.endpoint = endpoint || process.env.PROJECTB_GRAPHQL_ENDPOINT!;
    
    if (!this.endpoint) {
      throw new Error("GraphQL endpoint not configured. Set PROJECTB_GRAPHQL_ENDPOINT environment variable.");
    }
  }

  /**
   * Make an authenticated GraphQL request
   */
  async request<T = any>(
    document: RequestDocument,
    variables?: Variables,
    context?: GraphQLClientContext
  ): Promise<T> {
    const accessToken = context ? extractAccessToken(context) : undefined;
    
    if (!accessToken) {
      throw new Error("No access token available for GraphQL request");
    }

    const headers = {
      Cookie: `accessToken=${accessToken}`,
    };

    try {
      return await request<T>(this.endpoint, document, variables, headers);
    } catch (error) {
      console.error("GraphQL request failed:", error);
      throw error;
    }
  }

  /**
   * Make an authenticated GraphQL request with fallback handling
   */
  async requestWithFallback<T = any>(
    document: RequestDocument,
    variables?: Variables,
    context?: GraphQLClientContext,
    fallbackValue?: T
  ): Promise<T> {
    try {
      return await this.request<T>(document, variables, context);
    } catch (error) {
      console.warn("GraphQL request failed, using fallback:", error.message);
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }
      throw error;
    }
  }
}

// Export a default instance
export const graphqlClient = new ProjectBGraphQLClient(); 