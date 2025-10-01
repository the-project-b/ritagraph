import { GraphQLJSON } from "graphql-scalars";
import { EvaluationJobManager } from "../services/evaluation-job-manager.js";
import { ExperimentsService } from "../services/experiments.service.js";
import type { GraphQLContext } from "../types/index.js";
import { requireAuth } from "./auth.helpers.js";
import { filterFeedbackStats } from "./dynamic-schema.js";
import type { Resolvers, RunParent } from "./types.js";

// Create a singleton instance of ExperimentsService
const experimentsService = new ExperimentsService();

export const resolvers: Resolvers & { JSON: typeof GraphQLJSON } = {
  JSON: GraphQLJSON,
  FeedbackStats: {
    // Field resolver for the allStats field with optional filtering
    allStats: (parent, args) => {
      return filterFeedbackStats(parent, args.evaluators);
    },
  },
  Run: {
    // Field resolver for lazy loading feedback
    feedback: async (parent: RunParent, _args, context: GraphQLContext) => {
      requireAuth(context);

      // TODO: Implement feedback loading through experiments service
      // For now, return empty array
      return [];
    },
  },
  Query: {
    healthCheck: () => "Server is running!",
    getDatasetExperiments: async (_parent, { input }, context) => {
      requireAuth(context);

      return experimentsService.getDatasetExperiments(input);
    },
    getExperimentDetails: async (_parent, { input }, context) => {
      requireAuth(context);

      return experimentsService.getExperimentDetails(input);
    },
    getAvailableGraphs: async (_parent, _args, context) => {
      requireAuth(context);

      return ["rita"]; // TODO: We kinda changed this stuff around and should use the reigstry correctly, but do we really need to care about this?
    },
    getAvailableEvaluators: async (_parent, _args, context) => {
      requireAuth(context);

      // Get evaluator info from the experiments service which uses DDD package
      const evaluators = await experimentsService.getAvailableEvaluators();
      return {
        evaluators,
      };
    },
    getAvailableCompanies: async (_parent, _args, context) => {
      const user = requireAuth(context);

      // Transform the user's companies to match the GraphQL schema
      const companies = user.companies.map((company) => ({
        companyId: company.companyId,
        companyName: company.companyName,
        companyAvatarUrl: company.companyAvatarUrl,
        role: company.role,
        managingCompany: company.managingCompany,
      }));

      return {
        companies,
      };
    },
    getEvaluationJobStatus: async (_parent, { input }, context) => {
      requireAuth(context);

      const jobManager = EvaluationJobManager.getInstance();
      const jobDetails = jobManager.getJobDetails(input.jobId);

      if (!jobDetails) {
        return null;
      }

      return jobDetails;
    },
    getAllJobs: async (_parent, _args, context) => {
      requireAuth(context);

      const jobManager = EvaluationJobManager.getInstance();
      return jobManager.getAllJobs();
    },
  },
  Mutation: {
    runEvaluationAsync: async (_parent, { input }, context) => {
      requireAuth(context);

      const jobManager = EvaluationJobManager.getInstance();
      return jobManager.startEvaluationJob(input, context);
    },
    deleteExperimentRuns: async (_parent, { input }, context) => {
      requireAuth(context);

      return experimentsService.deleteExperimentRuns(input);
    },
  },
};
