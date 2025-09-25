import { CallbackHandler } from "@langfuse/langchain";
import type { AuthUser } from "../security/types.js";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";

/**
 * Wraps any LLM model with Langfuse callbacks configured with runtime user metadata.
 * This allows per-request user tracking in Langfuse while maintaining clean separation of concerns.
 *
 * @param model - The LLM model instance to wrap with callbacks
 * @param config - The LangGraph runtime config containing user information
 * @param getAuthUser - Function to extract auth user from config
 * @returns The same model instance with Langfuse callbacks added if auth is available
 */
export function wrapLLMWithCallbacks<T extends BaseLanguageModel>(
  model: T,
  config?: any,
  getAuthUser?: (config: any) => AuthUser,
): T {
  // Try to set up Langfuse callbacks with user metadata if we have auth
  if (config && getAuthUser) {
    try {
      const authUser = getAuthUser(config);

      // Create Langfuse handler with user-specific metadata
      const langfuseHandler = new CallbackHandler({
        userId: authUser.user.id,
        sessionId: (config.configurable as any)?.thread_id,
        tags: [
          authUser.user.role,
          authUser.user.company?.name || "unknown-company",
        ],
      });

      // Add Langfuse callbacks to the existing model
      if (model.callbacks && Array.isArray(model.callbacks)) {
        model.callbacks.push(langfuseHandler);
      } else {
        model.callbacks = [langfuseHandler];
      }
      return model;
    } catch (error) {
      // If we can't get auth user, just return model without Langfuse
      console.warn("Failed to create Langfuse callbacks:", error);
    }
  }

  // Fallback: return model without Langfuse callbacks
  return model;
}
