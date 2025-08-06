// codegen.ts
import type { CodegenConfig } from "@graphql-codegen/cli";
import dotenv from "dotenv";

dotenv.config();

// Fallback to production endpoint if not set
const graphqlEndpoint = process.env.PROJECTB_GRAPHQL_ENDPOINT || "https://dashboard.project-b.dev/graphqlapi";

const config: CodegenConfig = {
  schema: `${graphqlEndpoint}/schema`,
  documents: "src/**/*.gql",
  generates: {
    "src/generated/graphql.ts": {
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-graphql-request",
      ],
    },
  },
};

export default config;
