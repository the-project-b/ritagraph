import { PlaceholderResolver, PlaceholderContext } from "./types.js";
import { restClient } from "../utils/rest-client.js";

// Registry to cache resolvers and avoid recreation
const resolverRegistry = new Map<string, PlaceholderResolver>();

// Cache for SDL responses to avoid duplicate requests
const sdlCache = new Map<string, { data: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

interface GraphQLSDLResponse {
  schema: string;
  meta?: {
    tags: string[];
    queryFields?: string[];
    mutationFields?: string[];
    types?: string[];
    totalLines?: number;
  };
}

/**
 * Creates a dynamic PlaceholderResolver that fetches GraphQL SDL for specific tags
 * @param tags Array of tags to filter the GraphQL schema
 * @param name Name for the PlaceholderResolver
 * @returns PlaceholderResolver that fetches and returns the SDL
 */
const createGraphQLDLSResolver = (tags: string[], name: string): PlaceholderResolver => {
  // Create a unique key for this resolver configuration
  const resolverKey = `${name}:${tags.sort().join(',')}`;
  
  // Return cached resolver if it exists
  if (resolverRegistry.has(resolverKey)) {
    return resolverRegistry.get(resolverKey)!;
  }

  // Create new resolver
  const resolver: PlaceholderResolver = {
    name,
    resolve: async (context: PlaceholderContext): Promise<string> => {
      try {
        // Create cache key for this specific tag combination
        const cacheKey = tags.sort().join(',');
        const now = Date.now();
        
        // Check if we have a valid cached response
        const cached = sdlCache.get(cacheKey);
        if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
          console.log(`Using cached SDL for tags: ${cacheKey}`);
          return cached.data;
        }

        // Make REST request to fetch SDL
        console.log(`Fetching SDL for tags: ${cacheKey}`);
        const response = await restClient.get<GraphQLSDLResponse>(
          '/tagged-graphql/sdl',
          { tags }
        );

        if (!response || !response.schema) {
          throw new Error(`Invalid response: missing schema field`);
        }

        // Cache the response
        sdlCache.set(cacheKey, {
          data: response.schema,
          timestamp: now
        });

        // Log some metadata if available
        if (response.meta) {
          console.log(`SDL fetched successfully:`, {
            tags: response.meta.tags,
            queryFields: response.meta.queryFields?.length || 0,
            mutationFields: response.meta.mutationFields?.length || 0,
            types: response.meta.types?.length || 0,
            totalLines: response.meta.totalLines || 0
          });
        }

        return response.schema;
      } catch (error) {
        console.error(`Failed to fetch GraphQL SDL for tags [${tags.join(', ')}]:`, error);
        
        // Provide a fallback error message in SDL format
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `# Error fetching GraphQL SDL for tags: ${tags.join(', ')}\n# ${errorMessage}\n\ntype Query {\n  _error: String\n}`;
      }
    },
  };

  // Cache the resolver
  resolverRegistry.set(resolverKey, resolver);
  
  return resolver;
};

/**
 * Clear the SDL cache (useful for testing or manual cache invalidation)
 */
export const clearSDLCache = (): void => {
  sdlCache.clear();
  console.log('SDL cache cleared');
};

/**
 * Clear the resolver registry (useful for testing)
 */
export const clearResolverRegistry = (): void => {
  resolverRegistry.clear();
  console.log('Resolver registry cleared');
};

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
  return {
    sdlCacheSize: sdlCache.size,
    resolverRegistrySize: resolverRegistry.size,
    sdlCacheEntries: Array.from(sdlCache.keys()),
    resolverRegistryKeys: Array.from(resolverRegistry.keys()),
  };
};

// Export the function
export { createGraphQLDLSResolver };
