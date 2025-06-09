import fetch from "node-fetch";

/**
 * Reusable REST client for making authenticated requests
 */
export class ProjectBRestClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.PROJECTB_REST_SDL_ENDPOINT!;
    
    if (!this.baseUrl) {
      throw new Error("REST endpoint not configured. Set PROJECTB_REST_SDL_ENDPOINT environment variable.");
    }
  }

  /**
   * Make an authenticated GET request
   */
  async get<T = any>(
    path: string,
    params?: Record<string, string | string[]>
  ): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  /**
   * Make an authenticated POST request
   */
  async post<T = any>(
    path: string,
    body?: any,
    params?: Record<string, string | string[]>
  ): Promise<T> {
    return this.request<T>("POST", path, body, params);
  }

  /**
   * Make an authenticated PUT request
   */
  async put<T = any>(
    path: string,
    body?: any,
    params?: Record<string, string | string[]>
  ): Promise<T> {
    return this.request<T>("PUT", path, body, params);
  }

  /**
   * Make an authenticated DELETE request
   */
  async delete<T = any>(
    path: string,
    params?: Record<string, string | string[]>
  ): Promise<T> {
    return this.request<T>("DELETE", path, undefined, params);
  }

  /**
   * Make an authenticated REST request
   */
  private async request<T = any>(
    method: string,
    path: string,
    body?: any,
    params?: Record<string, string | string[]>
  ): Promise<T> {
    // Build URL with query parameters
    let url = `${this.baseUrl}${path}`;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','));
        } else {
          searchParams.append(key, value);
        }
      }
      url += `?${searchParams.toString()}`;
    }

    try {
      const response = await fetch(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`REST request failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json() as T;
      } else {
        return await response.text() as unknown as T;
      }
    } catch (error) {
      console.error("REST request failed:", error);
      throw error;
    }
  }

  /**
   * Make an authenticated REST request with fallback handling
   */
  async requestWithFallback<T = any>(
    method: string,
    path: string,
    fallbackValue?: T,
    body?: any,
    params?: Record<string, string | string[]>
  ): Promise<T> {
    try {
      return await this.request<T>(method, path, body, params);
    } catch (error) {
      console.warn("REST request failed, using fallback:", error.message);
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }
      throw error;
    }
  }
}

// Export a default instance
export const restClient = new ProjectBRestClient();
