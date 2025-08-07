# syntax=docker/dockerfile:1.5

########### Build stage ###########
FROM node:22-slim AS builder

WORKDIR /app

# Copy root package files for workspace configuration
COPY package*.json ./
COPY turbo.json ./
COPY .npmrc ./

# Copy workspace package.json files for dependency resolution
COPY apps/experiments/package.json ./apps/experiments/
COPY apps/rita/package.json ./apps/rita/
COPY packages/rita-graphs/package.json ./packages/rita-graphs/
COPY packages/projectb-graphql/package.json ./packages/projectb-graphql/

# Install all dependencies (including tsx for runtime)
RUN npm ci

# Copy the entire monorepo source
COPY . .

# Replace PROJECTB_GRAPHQL_ENDPOINT in all .env files with the QA4 endpoint
RUN find . -name ".env*" -type f -exec sed -i 's|PROJECTB_GRAPHQL_ENDPOINT=.*|PROJECTB_GRAPHQL_ENDPOINT="https://qa4-dashboard.dev.project-b.dev/graphqlapi"|g' {} \;

# Build the local packages first
RUN npm run build -- --filter=@the-project-b/graphql --filter=@the-project-b/rita-graphs

# Build the experiments app with esbuild (bundles and resolves all imports properly)
WORKDIR /app/apps/experiments
RUN NODE_ENV=production npm run build:docker

########### Runtime stage ###########
FROM node:22-slim AS runtime

WORKDIR /app

# Copy the bundled application
COPY --from=builder /app/apps/experiments/dist ./dist
COPY --from=builder /app/apps/experiments/package.json ./package.json

# Copy node_modules for external dependencies (not bundled by esbuild)
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production \
    PORT=4000

EXPOSE 4000

# Run the bundled JavaScript directly (no tsx needed, all imports resolved)
CMD ["node", "dist/main.js"] 