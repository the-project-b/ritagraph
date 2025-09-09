/**
 * Raw prompt template response with metadata.
 * This provides the raw template string without variable substitution,
 * along with metadata about the prompt version and source.
 */
export interface RawPromptResponse {
  /**
   * The raw template string without any variable substitution.
   */
  template: string;

  /**
   * List of input variables expected in the template.
   */
  inputVariables: string[];

  /**
   * Simplified metadata about the prompt.
   */
  metadata: {
    /**
     * The unique identifier of the prompt.
     * For LangSmith: the prompt ID
     * For in-memory: the prompt name
     */
    id: string;

    /**
     * The name of the prompt.
     */
    name: string;

    /**
     * The version of the prompt.
     * For LangSmith: the commit hash (e.g., "e147276f54ef...")
     * For in-memory: "in-memory"
     */
    version: string;

    /**
     * The source repository from which the prompt was retrieved.
     * e.g., "langsmith", "memory"
     */
    source: string;

    /**
     * Optional correlation ID for tracking related prompt operations.
     */
    correlationId?: string;

    /**
     * The timestamp when the prompt was retrieved.
     */
    retrievedAt: string;
  };
}

/**
 * Parameters for getting a raw prompt template.
 */
export interface GetRawPromptParams {
  /**
   * The name of the prompt to retrieve.
   */
  promptName: string;

  /**
   * The source repository to fetch from.
   */
  source?: string;

  /**
   * Optional correlation ID for tracking.
   */
  correlationId?: string;
}