import type { CodegenConfig } from "@graphql-codegen/cli";
import dotenv from "dotenv";
import { existsSync } from "fs";

export interface CodegenOptions {
  documents?: string;
  outputPath?: string;
  schemaUrl?: string;
}

export function createCodegenConfig(options: CodegenOptions = {}): CodegenConfig {
  // Try to load .env file if it exists (for local development)
  if (existsSync(".env")) {
    dotenv.config();
  }

  // Fallback to production endpoint if not set
  const defaultSchemaUrl = process.env.PROJECTB_GRAPHQL_ENDPOINT || "https://dashboard.project-b.dev/graphqlapi";

  const {
    documents = "src/**/*.gql",
    outputPath = "src/generated/graphql.ts",
    schemaUrl = defaultSchemaUrl
  } = options;

  console.log("test");

  const config: CodegenConfig = {
    schema: `${schemaUrl}/schema`,
    documents,
    generates: {
      [outputPath]: {
        plugins: [
          "typescript",
          "typescript-operations",
          "typescript-graphql-request",
        ],
      },
    },
  };

  return config;
}