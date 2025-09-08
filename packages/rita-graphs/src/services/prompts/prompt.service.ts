import {
  PromptService,
  InMemoryPromptRepository,
  LangSmithPromptRepository,
  LangSmithClientAdapter,
} from "@the-project-b/prompts";
import { createLogger } from "@the-project-b/logging";

// Create logger
const logger = createLogger({ service: "prompt-service" });

// Initialize LangSmith client
const langsmithClient = new LangSmithClientAdapter(
  {
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: process.env.LANGSMITH_ENDPOINT,
    workspace: process.env.LANGSMITH_PROJECT,
  },
  logger,
);

// Create repositories
const memoryRepo = new InMemoryPromptRepository();
const langsmithRepo = new LangSmithPromptRepository(langsmithClient, logger);

// Initialize PromptService with multiple sources
export const promptService = new PromptService({
  repositories: {
    memory: memoryRepo,
    langsmith: langsmithRepo,
  },
  defaultSource: "memory", // Default to local during development
  logger,
});
