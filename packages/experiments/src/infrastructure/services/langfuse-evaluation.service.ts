import { Result, err } from "@the-project-b/types";
import {
  EvaluationContext,
  EvaluationResult,
  EvaluationService,
} from "../../domain/index.js";
import { LangFuseAdapter } from "../adapters/langfuse.adapter.js";

/**
 * LangFuse implementation of EvaluationService (SCAFFOLDING ONLY)
 * TODO: Implement actual LangFuse integration
 */
export class LangFuseEvaluationService extends EvaluationService {
  constructor(
    private adapter: LangFuseAdapter,
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
    // TODO: Implement LangFuse evaluation execution
    // LangFuse approach:
    // 1. Create a trace for the evaluation
    // 2. Create observations for each step
    // 3. Add scores from evaluators
    // 4. Link to dataset items

    return err(new Error("LangFuse evaluation not yet implemented"));

    // Implementation outline:
    // const trace = this.client.trace({
    //   name: context.experiment.name,
    //   metadata: {
    //     experimentId: context.experiment.id.toString(),
    //     exampleId: context.example.id,
    //   },
    // });
    //
    // // Execute graph
    // const graph = await this.graphFactory(context.authContext);
    // const result = await graph.invoke(context.example.inputs);
    //
    // // Create observation
    // const observation = trace.observation({
    //   type: 'generation',
    //   name: 'graph_execution',
    //   input: context.example.inputs,
    //   output: result,
    // });
    //
    // // Run evaluators and create scores
    // for (const evaluator of context.evaluators) {
    //   const score = await this.runEvaluator(evaluator, result);
    //   trace.score({
    //     name: evaluator.type,
    //     value: score,
    //     observationId: observation.id,
    //   });
    // }
    //
    // // Create evaluation run
    // const run = EvaluationRun.create({...});
    //
    // return ok({ run, feedbackScores });
  }

  async *executeBatchEvaluation(
    contexts: EvaluationContext[],
  ): AsyncIterable<Result<EvaluationResult, Error>> {
    // TODO: Implement LangFuse batch evaluation
    // Process contexts and create traces for each
    for (const context of contexts) {
      yield await this.executeEvaluation(context);
    }
  }
}
