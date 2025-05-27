import { Client } from 'langsmith';

/**
 * Cache for loaded prompts to avoid repeated API calls
 */
const promptCache = new Map<string, { content: string; timestamp: number }>();

/**
 * Cache duration in milliseconds (5 minutes)
 */
const CACHE_DURATION = 5 * 60 * 1000;

/**
 * Load a prompt from LangSmith by repo handle
 * 
 * @param promptHandle - The repo handle of the prompt (e.g., "system_graphql_rules")
 * @param fallbackContent - Fallback content to use if loading fails
 * @returns The prompt content as a string
 */
export async function loadPromptFromLangSmith(
  promptHandle: string,
  fallbackContent: string
): Promise<string> {
  try {
    // Check cache first
    const cached = promptCache.get(promptHandle);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`Using cached prompt for ${promptHandle}`);
      return cached.content;
    }

    // Ensure we have the API key
    if (!process.env.LANGSMITH_API_KEY) {
      console.warn('LANGSMITH_API_KEY not found, using fallback content');
      return fallbackContent;
    }

    console.log(`Loading prompt ${promptHandle} from LangSmith...`);

    // Create LangSmith client
    const langsmithClient = new Client({
      apiKey: process.env.LANGSMITH_API_KEY,
    });

    // Pull the latest prompt commit
    const promptCommit = await langsmithClient.pullPromptCommit(promptHandle);

    // Extract the template content from the LangChain manifest
    let content = fallbackContent;
    
    if (promptCommit?.manifest?.kwargs?.template) {
      content = promptCommit.manifest.kwargs.template;
    } else if (promptCommit?.manifest?.kwargs?.messages) {
      // Handle ChatPromptTemplate format
      const messages = promptCommit.manifest.kwargs.messages;
      content = messages
        .map((msg: any) => {
          if (typeof msg === 'string') return msg;
          if (Array.isArray(msg) && msg.length >= 2) {
            return `${msg[0]}: ${msg[1]}`;
          }
          if (msg.content) return msg.content;
          if (msg.template) return msg.template;
          return JSON.stringify(msg);
        })
        .join('\n\n');
    } else {
      console.warn(`Unexpected prompt format for ${promptHandle}, using fallback`);
    }

    // Cache the result
    promptCache.set(promptHandle, {
      content,
      timestamp: Date.now(),
    });

    console.log(`Successfully loaded prompt ${promptHandle} from LangSmith`);
    return content;

  } catch (error) {
    console.error(`Failed to load prompt ${promptHandle} from LangSmith:`, error);
    console.log(`Using fallback content for ${promptHandle}`);
    return fallbackContent;
  }
}

/**
 * Clear the prompt cache (useful for development/testing)
 */
export function clearPromptCache(): void {
  promptCache.clear();
  console.log('Prompt cache cleared');
} 