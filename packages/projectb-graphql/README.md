# @projectb/graphql

Shared GraphQL codegen configuration for Project B monorepo.

## Usage

Create a `codegen.ts` file in your app:

```typescript
import { createCodegenConfig } from '@projectb/graphql';

export default createCodegenConfig({
  documents: "src/**/*.gql",
  outputPath: "src/generated/graphql.ts"
});
```

Then run codegen:

```bash
npx graphql-codegen --config codegen.ts
```

## Configuration Options

- `documents`: Glob pattern for GraphQL documents (default: `"src/**/*.gql"`)
- `outputPath`: Output path for generated TypeScript file (default: `"src/generated/graphql.ts"`)
- `schemaUrl`: GraphQL schema URL (default: from `PROJECTB_GRAPHQL_ENDPOINT` env var)