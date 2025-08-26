import { ChatOpenAI } from "@langchain/openai";

export const MAIN_MODEL = "gpt-4.1-mini";

export const BASE_MODEL_CONFIG: Partial<
  ConstructorParameters<typeof ChatOpenAI>[0]
> = {
  model: MAIN_MODEL,
  maxTokens: 16384,
};
