import { Result, err, isOk, ok, unwrap, unwrapErr } from "@the-project-b/types";
import { evaluate } from "langsmith/evaluation";
import { v4 as uuidv4 } from "uuid";
import {
  EvaluationContext,
  EvaluationResult,
  EvaluationRun,
  EvaluationService,
} from "../../domain/index.js";
import { LangSmithAdapter } from "../adapters/langsmith.adapter.js";

/**
 * LangSmith implementation of EvaluationService
 */
export class LangSmithEvaluationService extends EvaluationService {
  constructor(
    private adapter: LangSmithAdapter,
    private graphFactory?: (context: any) => Promise<any>,
  ) {
    super();
  }

  calculateExperimentUrl(experimentId: string, projectName?: string): string {
    return this.adapter.getExperimentUrl(experimentId);
  }

  async executeEvaluation(
    context: EvaluationContext,
  ): Promise<Result<EvaluationResult, Error>> {
    try {
      const { experiment, example, config, evaluators, authContext } = context;

      // Create target function for this specific example
      const target = async (inputs: any) => {
        if (!this.graphFactory) {
          throw new Error("Graph factory not configured");
        }

        // Create graph instance with auth context
        const graph = await this.graphFactory({
          token: authContext.token,
          userId: authContext.userId,
          companyId: authContext.companyId,
        });

        // Invoke graph with inputs
        const result = await graph.invoke({
          ...inputs,
          selectedCompanyId: config.selectedCompanyId,
          preferredLanguage: config.preferredLanguage,
        });

        return result;
      };

      // Run evaluation for single example
      const results = await evaluate(target, {
        data: [example.inputs],
        experimentPrefix: experiment.name,
        evaluators,
        maxConcurrency: 1,
        numRepetitions: 1,
        metadata: {
          experimentId: experiment.id.toString(),
          exampleId: example.id,
        },
      } as any);

      // Create evaluation run from results
      const runId = uuidv4();
      const runResult = EvaluationRun.create({
        id: runId,
        name: `${experiment.name}-${example.id}`,
        exampleId: example.id,
        experimentId: experiment.id.toString(),
        inputs: example.inputs,
        outputs: {}, // Results structure may vary based on langsmith version
        startTime: new Date(),
        endTime: new Date(),
        metrics: {
          // Extract metrics from results if available
        },
        feedbackScores: this.extractFeedbackScores(results),
      });

      if (!isOk(runResult)) {
        return err(new Error(unwrapErr(runResult).message));
      }

      return ok({
        run: unwrap(runResult),
        feedbackScores: this.extractFeedbackScores(results),
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error("Unknown error"));
    }
  }

  async *executeBatchEvaluation(
    contexts: EvaluationContext[],
  ): AsyncIterable<Result<EvaluationResult, Error>> {
    // Process contexts one by one
    for (const context of contexts) {
      yield await this.executeEvaluation(context);
    }
  }

  private extractFeedbackScores(results: any): any[] {
    const scores: any[] = [];

    // Handle different result structures from langsmith
    // The structure may vary based on the langsmith version
    if (results && typeof results === "object") {
      // Try to extract scores from various possible locations
      const possibleScoreLocations = [
        results.results,
        results.feedback,
        results.scores,
        results,
      ];

      for (const location of possibleScoreLocations) {
        if (location && typeof location === "object") {
          if (Array.isArray(location)) {
            // Handle array of results
            for (const item of location) {
              if (item && item.feedback) {
                this.extractScoresFromObject(item.feedback, scores);
              }
            }
          } else {
            // Handle single object
            this.extractScoresFromObject(location, scores);
          }
        }
      }
    }

    return scores;
  }

  private extractScoresFromObject(obj: any, scores: any[]): void {
    if (obj && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
          scores.push({
            key,
            score: typeof value === "number" ? value : undefined,
            value,
          });
        }
      }
    }
  }
}
