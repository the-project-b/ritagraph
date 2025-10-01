import {
  PromptService,
  InMemoryPromptRepository,
  LangSmithPromptRepository,
  LangSmithClientAdapter,
  LangFusePromptRepository,
  LangFuseClientAdapter,
} from "@the-project-b/prompts";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "experiments-prompt-service" });

const langsmithClient = new LangSmithClientAdapter(
  {
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: process.env.LANGSMITH_ENDPOINT,
    workspace: process.env.LANGSMITH_PROJECT,
  },
  logger,
);

const memoryRepo = new InMemoryPromptRepository();
const langsmithRepo = new LangSmithPromptRepository(langsmithClient, logger);

const repositories: Record<string, any> = {
  memory: memoryRepo,
  langsmith: langsmithRepo,
};

if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
  const langfuseClient = new LangFuseClientAdapter(
    {
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASEURL,
    },
    logger,
  );
  const langfuseRepo = new LangFusePromptRepository(langfuseClient, logger);
  repositories.langfuse = langfuseRepo;

  logger.info("LangFuse prompt repository initialized for experiments", {
    baseUrl: process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com",
    targetLabel: process.env.LANGFUSE_TARGET_LABEL,
    nodeEnv: process.env.NODE_ENV,
  });
} else {
  logger.debug(
    "LangFuse credentials not provided, skipping initialization for experiments",
  );
}

const defaultSource = process.env.PROMPT_SOURCE || "langfuse";

export const promptService = new PromptService({
  repositories,
  defaultSource: defaultSource as "memory" | "langsmith" | "langfuse",
  logger,
});