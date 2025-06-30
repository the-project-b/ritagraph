import { LangSmithService } from '../langsmith/service.js';

export const resolvers = {
  Query: {
    healthCheck: () => 'Server is running!',
  },
  Mutation: {
    runEvaluation: async (_: unknown, { input }: any, context: any) => {
      const langsmithService = new LangSmithService();
      return langsmithService.runEvaluation(input, context);
    },
  },
}; 