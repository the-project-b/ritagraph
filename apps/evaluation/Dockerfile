# syntax=docker/dockerfile:1.5

########### Build stage ###########
FROM node:22-slim AS builder

WORKDIR /app

# Copy root package files for workspace configuration
COPY package*.json ./
COPY turbo.json ./
COPY .npmrc ./

# Copy workspace package.json files for dependency resolution
COPY apps/evaluation/package.json ./apps/evaluation/
COPY apps/rita/package.json ./apps/rita/
COPY packages/rita-graphs/package.json ./packages/rita-graphs/
COPY packages/projectb-graphql/package.json ./packages/projectb-graphql/
COPY packages/logging/package.json ./packages/logging/
COPY packages/prompts/package.json ./packages/prompts/

# Install all dependencies (including tsx for runtime)
RUN npm ci

# Copy the entire monorepo source
COPY . .

# Replace PROJECTB_GRAPHQL_ENDPOINT in all .env files with the QA4 endpoint
RUN find . -name ".env*" -type f -exec sed -i 's|PROJECTB_GRAPHQL_ENDPOINT=.*|PROJECTB_GRAPHQL_ENDPOINT="https://qa4-dashboard.dev.project-b.dev/graphqlapi"|g' {} \;

# Build the local packages first
RUN npm run build -- --filter=@the-project-b/graphql --filter=@the-project-b/rita-graphs --filter=@the-project-b/logging --filter=@the-project-b/prompts

# Generate GraphQL types for experiments app
WORKDIR /app/apps/evaluation
RUN npm run codegen

# Build the experiments app with TypeScript compiler
RUN npm run build

########### Runtime stage ###########
FROM node:22-slim AS runtime

WORKDIR /app

# Copy the compiled application and all dependencies
COPY --from=builder /app/apps/evaluation/dist ./dist
COPY --from=builder /app/apps/evaluation/src ./src
COPY --from=builder /app/apps/evaluation/package.json ./package.json
COPY --from=builder /app/apps/evaluation/tsconfig.json ./tsconfig.json

# Copy ALL node_modules including workspace packages
COPY --from=builder /app/node_modules ./node_modules

# Copy the built workspace packages
COPY --from=builder /app/packages ./packages

# Production environment configuration
# - JSON logging for structured logs (Datadog/CloudWatch compatible)
# - No pretty printing to avoid worker thread issues
# - Production mode for optimized performance
ENV NODE_ENV=production \
    PORT=4000 \
    LOGGING_OUTPUT_FORMAT=json \
    LOGGING_SINGLE_LINE=true

EXPOSE 4000

# Install tsx for runtime TypeScript/ESM support
RUN npm install -g tsx

# Run with tsx to handle all module resolution properly
CMD ["tsx", "src/main.ts"] 