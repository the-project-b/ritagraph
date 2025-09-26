import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { createLogger } from "@the-project-b/logging";

import { typeDefs } from "./graphql/typeDefs.js";
import { resolvers } from "./graphql/resolvers.js";
import { authMiddleware } from "./auth/middleware.js";
import { EvaluatorRegistry } from "./evaluators/core/registry.js";

const logger = createLogger({ service: "experiments" });

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    typeDefs,
    resolvers: resolvers as any, // Type assertion to work around Apollo's loose typing
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    introspection: process.env.NODE_ENV !== "production",
  });

  await server.start();

  app.use(
    "/graphql",
    cors(),
    express.json(),
    authMiddleware(), // Call the function to get the actual middleware
    expressMiddleware(server, {
      context: async ({ req }) => ({
        user: req.user, // Access the verified user data from middleware
        token: req.headers.authorization,
      }),
    }),
  );

  const port = process.env.PORT || 4000;
  const environment = process.env.NODE_ENV || "development";
  await new Promise<void>((resolve) => httpServer.listen({ port }, resolve));
  // Main startup message - always show this
  logger.info(`🚀 Server ready at http://localhost:${port}/graphql`);

  // Additional startup details at debug level
  logger.debug(`Server configuration`, {
    port,
    environment,
    introspection: process.env.NODE_ENV !== "production",
    endpoint: "/graphql",
    authRequired: true,
    authType: "Bearer",
  });

  // List registered evaluators at debug level
  const evaluators = EvaluatorRegistry.getAll();
  const evaluatorTypes = evaluators.map((e) => e.config.type);
  logger.debug(
    `📊 Registered ${evaluators.length} evaluators: ${evaluatorTypes.join(", ")}`,
  );

  // Detailed evaluator info at trace level
  evaluators.forEach((evaluator) => {
    logger.trace(`Evaluator details: ${evaluator.config.type}`, {
      type: evaluator.config.type,
      name: evaluator.config.name,
      description: evaluator.config.description,
      supportsCustomPrompt: evaluator.config.supportsCustomPrompt,
      supportsReferenceKey: evaluator.config.supportsReferenceKey,
      defaultModel: evaluator.config.defaultModel,
    });
  });
}

startServer().catch((error) => {
  logger.error("Failed to start server", error, {
    errorType: error?.constructor?.name || "UnknownError",
    errorMessage: error?.message,
    port: process.env.PORT || 4000,
    environment: process.env.NODE_ENV || "development",
  });
  process.exit(1);
});
