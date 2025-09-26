# @the-project-b/experiments

DDD-based experiments package with multi-provider support for evaluation and experimentation.

## Features

- **Multi-provider support**: LangSmith (fully implemented) and LangFuse (scaffolding)
- **Domain-Driven Design**: Clean separation of concerns with domain, application, and infrastructure layers
- **Provider abstraction**: Easy switching between providers via configuration
- **Type-safe**: Strong TypeScript types throughout
- **Evaluator system**: Pluggable evaluators for different evaluation types

## Installation

This is a local package within the monorepo. Add it to your dependencies:

```json
{
  "dependencies": {
    "@the-project-b/experiments": "*"
  }
}
```

## Usage

### Quick Start

```typescript
import { createExperimentsFromEnv, createUseCases } from '@the-project-b/experiments';

// Create repositories from environment configuration
const repositories = createExperimentsFromEnv(graphFactory);

// Create use cases
const useCases = createUseCases(repositories);

// Run an evaluation
const result = await useCases.runEvaluation.execute({
  graphName: 'rita',
  datasetName: 'my-dataset',
  evaluators: [{ type: 'EXPECTED_OUTPUT' }],
  selectedCompanyId: 'company-123',
}, {
  authToken: 'token',
  userId: 'user-123',
  companyId: 'company-123',
});
```

### Configuration

Set provider via environment variables:

```bash
# Provider selection
EXPERIMENTS_PROVIDER=langsmith  # or 'langfuse'

# LangSmith configuration
LANGSMITH_API_KEY=xxx
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_PROJECT=default

# LangFuse configuration (not yet fully implemented)
LANGFUSE_PUBLIC_KEY=xxx
LANGFUSE_SECRET_KEY=xxx
LANGFUSE_HOST=https://cloud.langfuse.com
```

### Direct Provider Configuration

```typescript
import { ProviderFactory, ProviderType } from '@the-project-b/experiments';

const repositories = ProviderFactory.createRepositories({
  type: ProviderType.LANGSMITH,
  langsmith: {
    apiKey: 'xxx',
    apiUrl: 'https://api.smith.langchain.com',
    projectName: 'my-project',
  },
  graphFactory: myGraphFactory,
});
```

## Architecture

### Domain Layer
- **Entities**: Dataset, Example, Experiment, EvaluationRun
- **Value Objects**: DatasetId, ExperimentId, Split, EvaluationConfig
- **Repositories**: Interfaces for data access
- **Services**: Domain services like EvaluationService

### Application Layer
- **Use Cases**: RunEvaluation, ListExperiments, GetExperimentDetails, DeleteExperiment
- **Services**: JobManager, EvaluationOrchestrator
- **DTOs**: Data transfer objects for API communication

### Infrastructure Layer
- **Adapters**: LangSmith and LangFuse provider adapters
- **Repositories**: Provider-specific implementations
- **Factories**: Provider factory for creating repositories

## Provider Support

### LangSmith (Fully Implemented)
- ✅ Dataset operations
- ✅ Experiment management
- ✅ Evaluation execution
- ✅ Prompt management
- ⚠️  Limited deletion support (LangSmith API limitations)

### LangFuse (Scaffolding Only)
- 🚧 All operations return "not implemented" errors
- 🚧 Ready for implementation when needed
- 🚧 Follows same interface as LangSmith adapter

## Evaluators

Built-in evaluators:
- `EXPECTED_OUTPUT`: Compares output to expected reference

Register custom evaluators:

```typescript
import { EvaluatorRegistry } from '@the-project-b/experiments';

const registry = EvaluatorRegistry.getInstance();
registry.register(myCustomEvaluator);
```

## Migration from Direct LangSmith Usage

1. Replace direct LangSmith client usage with repositories
2. Use use cases instead of direct service calls
3. Configure provider via environment variables
4. Update GraphQL resolvers to use use cases

## Development

```bash
# Build the package
npm run build --workspace=packages/experiments

# Run tests
npm test --workspace=packages/experiments

# Watch mode
npm run dev --workspace=packages/experiments
```

## Future Enhancements

- Complete LangFuse implementation
- Add more evaluator types
- Implement caching layer
- Add migration tools between providers
- Support for hybrid provider usage