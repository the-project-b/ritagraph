# RitaGraph

A Turborepo monorepo containing LangGraph.js-based services for Project B.

## Overview

This repository contains two main applications:
- **Rita** (`apps/rita`): LangGraph.js graphs for conversational AI workflows
- **Experiments** (`apps/experiments`): GraphQL server for running LangSmith evaluations against Rita graphs

## Prerequisites

- Node.js 22.17.0+ (with npm 10.9.2+)
- Backend and tools service running

## Setup

### 1. Clone the repository
```bash
git clone https://github.com/the-project-b/ritagraph.git
cd ritagraph
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment configuration

Each app requires environment variables. Copy the example files and configure:

```bash
# For Rita app
cp apps/rita/.env.example apps/rita/.env

# For Experiments app (if needed)
cp apps/experiments/.env.example apps/experiments/.env
```

Key environment variables:
- `PROJECTB_GRAPHQL_ENDPOINT`: GraphQL API endpoint (default: http://localhost:3002/graphqlapi)
- `PROJECTB_REST_SDL_ENDPOINT`: REST SDL endpoint (default: http://localhost:3001)
- `LANGSMITH_API_KEY`: Required for LangSmith integration
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`: LLM provider keys

### 4. Generate GraphQL types

**Important**: Ensure your backend services are running before this step.

```bash
npm run codegen:graphql
```

### 5. Build all applications
```bash
npm run build
```

## Development

### Start development servers
```bash
npm run dev
```

### Run specific app in development
```bash
# Rita app
npm run dev --filter=@the-project-b/rita-v2-graphs

# Experiments app
npm run dev --filter=@the-project-b/experiments
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all applications |
| `npm run dev` | Start all development servers |
| `npm run lint` | Lint all applications |
| `npm run test` | Run tests for all applications |
| `npm run start` | Start all applications |
| `npm run generate` | Run code generation tasks |
| `npm run codegen:graphql` | Generate GraphQL types |

## Project Structure

```
ritagraph/
├── apps/
│   ├── rita/              # LangGraph.js conversational AI service
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── experiments/       # LangSmith evaluation server
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── package.json          # Root package.json with workspaces
├── turbo.json           # Turborepo configuration
└── README.md            # This file
```

## Turborepo Features

This monorepo uses [Turborepo](https://turbo.build/repo) for:
- **Parallel execution**: Tasks run in parallel when possible
- **Smart caching**: Only rebuild what's changed
- **Task pipelines**: Automatic dependency management between tasks

### Filtering builds
```bash
# Build only rita app
npm run build --filter=@the-project-b/rita-v2-graphs

# Build only experiments app
npm run build --filter=@the-project-b/experiments
```

## Cleanup

### Remove all build artifacts and dependencies
```bash
# Remove node_modules
find . -name "node_modules" -type d -prune -exec rm -rf '{}' +

# Remove dist folders
find . -name "dist" -type d -prune -exec rm -rf '{}' +

# Remove generated files
rm -rf apps/rita/src/generated/
rm -rf .turbo

# Remove all artifacts at once (Unix/macOS)
npm run clean # If configured, or use the commands above
```

### Fresh install
```bash
# After cleanup
npm install
npm run codegen:graphql
npm run build
```

## Troubleshooting

### GraphQL codegen fails
- Ensure backend services are running on ports 3001 and 3002
- Check your `.env` file has correct `PROJECTB_GRAPHQL_ENDPOINT`
- Verify network connectivity to the endpoints

### Build errors
- Run `npm install` to ensure all dependencies are installed
- Generate GraphQL types: `npm run codegen:graphql`
- Check TypeScript errors: `npx tsc --noEmit` in the specific app directory

### Turbo cache issues
```bash
# Clear turbo cache
rm -rf .turbo
# Or use turbo command
npx turbo daemon clean
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure all tests pass: `npm run test`
4. Ensure linting passes: `npm run lint`
5. Build successfully: `npm run build`
6. Submit a pull request

## License

MIT