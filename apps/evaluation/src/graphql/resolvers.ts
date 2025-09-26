import { GraphQLJSON } from "graphql-scalars";
import { EVALUATOR_INFO } from "../evaluators/core/factory.js";
import { LangSmithService } from "../langsmith/service.js";
import { EvaluationJobManager } from "../services/evaluation-job-manager.js";
import type { GraphQLContext } from "../types/index.js";
import { requireAuth } from "./auth.helpers.js";
import { filterFeedbackStats } from "./dynamic-schema.js";
import type { Resolvers, RunParent } from "./types.js";

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

      const langsmithService = new LangSmithService();
      return await langsmithService.getFeedbackForRun(parent.id);
    },
  },
  Query: {
    healthCheck: () => "Server is running!",
    getDatasetExperiments: async (_parent, { input }, context) => {
      requireAuth(context);

      const langsmithService = new LangSmithService();
      const result = await langsmithService.getDatasetExperiments(input);

      // Transform the experiments to match GraphQL schema
      const transformedExperiments = result.experiments.map((experiment) => ({
        ...experiment,
        // feedbackStats and metadata are now properly handled as JSON objects
      }));

      return {
        experiments: transformedExperiments,
        total: result.total,
      };
    },
    getExperimentDetails: async (_parent, { input }, context) => {
      requireAuth(context);

      const langsmithService = new LangSmithService();
      const result = await langsmithService.getExperimentDetails(input);

      // Transform the runs to match GraphQL schema
      const transformedRuns = result.runs.map((run) => ({
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
    getAvailableGraphs: async (_parent, _args, context) => {
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
        throw new Error(`Evaluation job with ID ${input.jobId} not found`);
      }

      return jobDetails;
    },
    listLangSmithPrompts: async (_parent, { input }, context) => {
      requireAuth(context);

      const langsmithService = new LangSmithService();
      const prompts = await langsmithService.listPrompts(
        input?.query,
        input?.isPublic || false,
      );

      return {
        prompts,
      };
    },
    getAllJobs: async (_parent, _args, context) => {
      requireAuth(context);

      const jobManager = EvaluationJobManager.getInstance();
      return jobManager.getAllJobs();
    },
  },
  Mutation: {
    // runEvaluation: async (_parent, { input }, context) => {
    //   requireAuth(context);

    //   const langsmithService = new LangSmithService();
    //   return langsmithService.runEvaluation(input, context);
    // },
    runEvaluationAsync: async (_parent, { input }, context) => {
      requireAuth(context);

      const jobManager = EvaluationJobManager.getInstance();
      return jobManager.startEvaluationJob(input, context);
    },
    deleteExperimentRuns: async (_parent, { input }, context) => {
      requireAuth(context);

      const langsmithService = new LangSmithService();
      return langsmithService.deleteExperimentRuns(input);
    },
  },
};
