# syntax=docker/dockerfile:1.5

########### Build stage ###########
FROM node:22-slim AS builder

WORKDIR /app

# Copy manifest files first for better cache utilisation
COPY package*.json ./
COPY .npmrc .npmrc

# Install dependencies with build-time GitHub token
RUN --mount=type=secret,id=GITHUB_TOKEN \
    export GITHUB_TOKEN=$(cat /run/secrets/GITHUB_TOKEN) && \
    npm ci

# Copy the rest of the source
COPY . .

# Compile TypeScript → dist
RUN npm run build

# Remove dev-dependencies to shrink final image
RUN npm prune --omit=dev

########### Runtime stage ###########
FROM node:22-slim AS runtime

WORKDIR /app

# Copy node_modules (pruned) + compiled code
COPY --from=builder /app /app

ENV NODE_ENV=production \
    PORT=4000

EXPOSE 4000

CMD ["node", "dist/main.js"] 