import type { CodegenConfig } from "@graphql-codegen/cli";
import dotenv from "dotenv";

dotenv.config({ path: "../../apps/rita/.env" });

const config: CodegenConfig = {
  schema: `${process.env.PROJECTB_GRAPHQL_ENDPOINT}/schema`,
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