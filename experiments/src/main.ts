import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';

import { typeDefs } from './graphql/typeDefs.js';
import { resolvers } from './graphql/resolvers.js';
import { authMiddleware } from './auth/middleware.js';
import { EvaluatorRegistry } from './evaluators/core/registry.js';

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    typeDefs,
    resolvers: resolvers as any, // Type assertion to work around Apollo's loose typing
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    introspection: process.env.NODE_ENV !== 'production',
  });

  await server.start();

  app.use(
    '/graphql',
    cors(),
    express.json(),
    authMiddleware(), // Call the function to get the actual middleware
    expressMiddleware(server, {
      context: async ({ req }) => ({ 
        user: req.user, // Access the verified user data from middleware
        token: req.headers.authorization 
      }),
    }),
  );

  const port = process.env.PORT || 4000;
  await new Promise<void>((resolve) => httpServer.listen({ port }, resolve));
  console.log(`🚀 Server ready at http://localhost:${port}/graphql`);
  console.log(`🔐 Authentication middleware enabled - all GraphQL operations require valid Bearer token`);
  
  // List registered evaluators
  console.log(`\n📊 Registered Evaluators:`);
  const evaluators = EvaluatorRegistry.getAll();
  evaluators.forEach((evaluator) => {
    console.log(`  - ${evaluator.config.type}: ${evaluator.config.description}`);
  });
  console.log(`  Total: ${evaluators.length} evaluator(s) registered\n`);
}

startServer().catch((error) => {
  console.error('Failed to start server', error);
}); 