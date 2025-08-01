import type { CodegenConfig } from "@graphql-codegen/cli";
import dotenv from "dotenv";

export interface CodegenOptions {
  documents?: string;
  outputPath?: string;
  schemaUrl?: string;
}

export function createCodegenConfig(options: CodegenOptions = {}): CodegenConfig {
  // Load environment variables
  dotenv.config();

  const {
    documents = "src/**/*.gql",
    outputPath = "src/generated/graphql.ts",
    schemaUrl = process.env.PROJECTB_GRAPHQL_ENDPOINT
  } = options;

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