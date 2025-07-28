import { LangSmithService } from '../langsmith/service.js';
import type { 
  GetDatasetExperimentsInput, 
  GetExperimentDetailsInput, 
  RunEvaluationInput, 
  DeleteExperimentRunsInput 
} from '../types/index.js';
import type { GraphQLContext } from '../types/context.js';
import { GraphQLJSON } from 'graphql-scalars';
import { requireAuth } from './auth.helpers.js';
import { EVALUATOR_INFO } from '../langsmith/evaluators.js';

export const resolvers = {
  JSON: GraphQLJSON,
  Run: {
    // Field resolver for lazy loading feedback
    feedback: async (parent: any, _: any, context: GraphQLContext) => {
      requireAuth(context);
      
      const langsmithService = new LangSmithService();
      return await langsmithService.getFeedbackForRun(parent.id);
    },
  },
  Query: {
    healthCheck: () => 'Server is running!',
    getDatasetExperiments: async (_: unknown, { input }: { input: GetDatasetExperimentsInput }, context: GraphQLContext) => {
      requireAuth(context);
      
      const langsmithService = new LangSmithService();
      const result = await langsmithService.getDatasetExperiments(input);
      
      // Transform the experiments to match GraphQL schema
      const transformedExperiments = result.experiments.map(experiment => ({
        ...experiment,
        // feedbackStats and metadata are now properly handled as JSON objects
      }));

      return {
        experiments: transformedExperiments,
        total: result.total,
      };
    },
    getExperimentDetails: async (_: unknown, { input }: { input: GetExperimentDetailsInput }, context: GraphQLContext) => {
      requireAuth(context);
      
      const langsmithService = new LangSmithService();
      const result = await langsmithService.getExperimentDetails(input);
      
      // Transform the runs to match GraphQL schema
      const transformedRuns = result.runs.map(run => ({
        ...run,
        // inputs, outputs, metadata are now properly handled as JSON objects
      }));

      return {
        experiment: {
          ...result.experiment,
          // metadata is now properly handled as JSON object
        },
        runs: transformedRuns,
        totalRuns: result.totalRuns,
      };
    },
    getAvailableGraphs: async (_: unknown, __: unknown, context: GraphQLContext) => {
      requireAuth(context);
      
      const langsmithService = new LangSmithService();
      return langsmithService.getAvailableGraphs();
    },
    getAvailableEvaluators: () => {
      // Convert the EVALUATOR_INFO record to an array of evaluator info objects
      const evaluators = Object.values(EVALUATOR_INFO);
      return {
        evaluators,
      };
    },
    getAvailableCompanies: async (_: unknown, __: unknown, context: GraphQLContext) => {
      const user = requireAuth(context);
      
      // Transform the user's companies to match the GraphQL schema
      const companies = user.companies.map(company => ({
        companyId: company.companyId,
        companyName: company.companyName,
        companyAvatarUrl: company.companyAvatarUrl,
        role: company.role,
      }));
      
      return {
        companies,
      };
    },
  },
  Mutation: {
    runEvaluation: async (_: unknown, { input }: { input: RunEvaluationInput }, context: GraphQLContext) => {
      requireAuth(context);
      
      const langsmithService = new LangSmithService();
      return langsmithService.runEvaluation(input, context);
    },
    deleteExperimentRuns: async (_: unknown, { input }: { input: DeleteExperimentRunsInput }, context: GraphQLContext) => {
      requireAuth(context);
      
      const langsmithService = new LangSmithService();
      return langsmithService.deleteExperimentRuns(input);
    },
  },
};