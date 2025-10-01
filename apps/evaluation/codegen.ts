import { createCodegenConfig } from '@the-project-b/graphql';

export default createCodegenConfig({
  documents: "src/**/*.gql",
  outputPath: "src/generated/graphql.ts"
});