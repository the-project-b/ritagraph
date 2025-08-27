import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "prompts" });

logger.info("hello world");
