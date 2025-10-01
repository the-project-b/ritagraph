import { Result, err } from "@the-project-b/types";
import {
  EvaluationContext,
  EvaluationResult,
  EvaluationService,
} from "../../domain/index.js";
import { LangFuseAdapter } from "../adapters/langfuse.adapter.js";
import { RitaThreadRepository } from "../../domain/repositories/rita-thread.repository.js";

/**
 * LangFuse implementation of EvaluationService (stub for now)
 */
export class LangFuseEvaluationService extends EvaluationService {
  constructor(
    private adapter: LangFuseAdapter,
    private graphFactory?: (context: any) => Promise<any>,
    private threadRepository?: RitaThreadRepository,
  ) {
    super();
  }

  calculateExperimentUrl(experimentId: string, projectName?: string): string {
    // TODO: Implement LangFuse URL generation
    return `https://langfuse.com/experiments/${experimentId}`;
  }

  async executeEvaluation(
    context: EvaluationContext,
  ): Promise<Result<EvaluationResult, Error>> {
    // TODO: Implement LangFuse evaluation
    return err(new Error("LangFuse evaluation not yet implemented"));
  }

  async *executeBatchEvaluation(
    contexts: EvaluationContext[],
  ): AsyncIterable<Result<EvaluationResult, Error>> {
    // TODO: Implement batch evaluation for LangFuse
    for (const context of contexts) {
      yield await this.executeEvaluation(context);
    }
  }
}
