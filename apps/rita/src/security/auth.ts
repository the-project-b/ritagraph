import { createAuthInstance, getAuthUser } from "@the-project-b/rita-graphs";
import { Auth } from "@langchain/langgraph-sdk/auth";

// Create local Auth instance using shared factory
// This eliminates duplication while maintaining app-specific Auth instance for LangGraph
export const auth: Auth = createAuthInstance();

// Re-export getAuthUser for convenience
export { getAuthUser };
