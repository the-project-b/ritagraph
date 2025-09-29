import { Result, err, ok, isOk, unwrap, unwrapErr } from "@the-project-b/types";
import { evaluate } from "langsmith/evaluation";
import { createLogger } from "@the-project-b/logging";
import {
  EvaluationContext,
  EvaluationResult,
  EvaluationService,
  EvaluatorDefinition,
  Experiment,
  EvaluationConfig,
  EvaluationRun,
} from "../../domain/index.js";
import {
  expectedOutputEvaluator,
  languageVerificationEvaluator,
  dataChangeProposalEvaluator,
  titleGenerationEvaluator,
  proposalQuoteVerificationEvaluator,
} from "../evaluators/index.js";
import { TemplateProcessor } from "../evaluators/helpers/template-processor.js";
import { TemplateContext } from "../evaluators/helpers/template-variable-registry.js";
import { AuthContextDto } from "../../application/dto/auth-context.dto.js";
import { LangSmithAdapter } from "../adapters/langsmith.adapter.js";
import { RitaThreadRepository } from "../../domain/repositories/rita-thread.repository.js";
import {
  RitaThreadTriggerType,
  RitaThreadStatus,
  RitaThread,
} from "../../domain/entities/rita-thread.entity.js";
import {
  GraphFactory,
  LangSmithExample,
  LangSmithEvaluationResults,
  LangSmithDataSource,
  TargetFunctionInput,
  TargetFunctionResult,
  GraphInput,
  GraphConfig,
  EvaluatorFunction,
  LangSmithEvaluateOptions,
  EvaluatorInput,
  EvaluatorOutput,
  EvaluatorReferenceOutput,
} from "../types/langsmith.types.js";

const logger = createLogger({ service: "experiments" }).child({
  module: "LangSmithEvaluationService",
});

/**
 * LangSmith implementation of EvaluationService
 */

export class LangSmithEvaluationService extends EvaluationService {
  constructor(
    private adapter: LangSmithAdapter,
    private graphFactory?: GraphFactory,
    private threadRepository?: RitaThreadRepository,
  ) {
    super();
  }

  calculateExperimentUrl(experimentId: string, _projectName?: string): string {
    return this.adapter.getExperimentUrl(experimentId);
  }

  async executeEvaluation(
    _context: EvaluationContext,
  ): Promise<Result<EvaluationResult, Error>> {
    // This method is for single example evaluation, but LangSmith works better with dataset names
    // For now, return an error to force usage of executeBatchEvaluation
    return err(
      new Error(
        "Single example evaluation not supported. Use executeBatchEvaluation instead.",
      ),
    );
  }

  async executeDatasetEvaluation(
    datasetName: string,
    config: EvaluationConfig,
    evaluators: EvaluatorDefinition[],
    authContext: AuthContextDto,
    experiment: Experiment,
    splits?: string[],
  ): Promise<Result<EvaluationResult, Error>> {
    try {
      logger.info("Executing dataset evaluation", {
        datasetName,
        experimentId: experiment.id.toString(),
        graphFactory: !!this.graphFactory,
        splits,
      });

      // Create target function that will be called for each example
      const targetFunction =
        await this.createTargetFunctionForDataset(authContext);

      // Create evaluator functions from definitions
      const evaluatorFunctions = await this.createEvaluators(evaluators);

      // If we have splits, we need to filter examples manually due to LangSmith SDK bug
      let dataSource: LangSmithDataSource;
      if (splits && splits.length > 0) {
        logger.debug(
          "Creating manually filtered example generator for splits",
          {
            splits,
          },
        );

        // Create an example generator that we'll filter manually
        // Cast to unknown first to bypass TypeScript's strict checking
        // since client is a private property of LangSmithAdapter
        const client = (
          this.adapter as unknown as {
            client: {
              listExamples: (params: {
                datasetName: string;
              }) => AsyncIterable<LangSmithExample>;
            };
          }
        ).client;
        const allExamples = client.listExamples({
          datasetName,
          // Don't pass splits to LangSmith - we'll filter manually
        });

        // Create an async generator that filters examples by splits
        async function* filterExamplesBySplits() {
          for await (const example of allExamples) {
            const exampleSplits =
              example.metadata?.dataset_split || example.split || [];
            const hasSplit = Array.isArray(exampleSplits)
              ? splits.some((s) => exampleSplits.includes(s))
              : splits.includes(exampleSplits as string);

            if (hasSplit) {
              logger.debug("Including example", {
                exampleId: example.id,
                splits: exampleSplits,
              });
              yield example;
            }
          }
        }

        dataSource = filterExamplesBySplits();
      } else {
        // No splits specified, use the full dataset
        dataSource = datasetName;
      }

      logger.info("Calling LangSmith evaluate", {
        datasetName,
        experimentPrefix: config.experimentPrefix || "experiment",
        evaluatorCount: evaluatorFunctions.length,
        splits,
        dataSourceType:
          typeof dataSource === "string" ? "dataset-name" : "example-generator",
      });

      // Run evaluation using LangSmith's evaluate function
      logger.info("Starting LangSmith evaluate (this may take a while)...");

      const evaluateOptions: LangSmithEvaluateOptions = {
        data: dataSource,
        experimentPrefix: config.experimentPrefix || "experiment",
        evaluators: evaluatorFunctions,
        maxConcurrency: config.maxConcurrency || 5,
        numRepetitions: config.numRepetitions || 1,
        metadata: {
          experimentId: experiment.id.toString(),
          splits,
        },
      };

      // Cast to unknown first since LangSmith's types aren't fully aligned
      const results = await evaluate(
        targetFunction,
        evaluateOptions as unknown as Parameters<typeof evaluate>[1],
      );

      const langsmithResults = results as unknown as LangSmithEvaluationResults;

      logger.info("LangSmith evaluate completed", {
        hasResults: !!results,
        hasManager: !!langsmithResults?.manager,
        hasExperiment: !!langsmithResults?.manager?._experiment,
        experimentId: langsmithResults?.manager?._experiment?.id,
        experimentName: langsmithResults?.manager?._experiment?.name,
        resultsCount: langsmithResults?.results?.length,
      });

      // Import EvaluationRun at the top of the file to create proper run
      const runResult = EvaluationRun.create({
        id: langsmithResults?.experimentId || `exp_${Date.now()}`,
        name:
          langsmithResults?.experimentName ||
          config.experimentPrefix ||
          "evaluation",
        exampleId: "batch-evaluation",
        experimentId: experiment.id.toString(),
        inputs: { datasetName },
        outputs: {
          experimentId: langsmithResults?.experimentId,
          url: this.adapter.getExperimentUrl(
            langsmithResults?.experimentId || experiment.id.toString(),
          ),
        },
        startTime: new Date(),
        endTime: new Date(),
        metrics: {
          totalTokens: 0,
        },
        feedbackScores: [],
        metadata: {
          splits,
          resultsCount: langsmithResults?.results?.length || 0,
        },
      });

      if (!isOk(runResult)) {
        return err(new Error("Failed to create evaluation run"));
      }

      const evaluationResult: EvaluationResult = {
        run: unwrap(runResult),
        feedbackScores: [],
      };

      return ok(evaluationResult);
    } catch (error) {
      logger.error("Evaluation failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return err(
        error instanceof Error ? error : new Error("Evaluation failed"),
      );
    }
  }

  async *executeBatchEvaluation(
    contexts: EvaluationContext[],
  ): AsyncIterable<Result<EvaluationResult, Error>> {
    // For now, execute evaluations one by one
    // Could be optimized to batch with LangSmith's evaluate
    for (const context of contexts) {
      yield await this.executeEvaluation(context);
    }
  }

  private async createTargetFunctionForDataset(
    authContext: AuthContextDto,
  ): Promise<(input: TargetFunctionInput) => Promise<TargetFunctionResult>> {
    if (!this.graphFactory) {
      throw new Error("Graph factory not provided");
    }

    // Return a function that will be called by LangSmith for each example
    return async (
      input: TargetFunctionInput,
    ): Promise<TargetFunctionResult> => {
      logger.debug("Target function invoked", {
        hasInput: !!input,
        inputKeys: input ? Object.keys(input) : [],
      });

      // Extract the question from the input
      let question = input.question;
      if (!question || typeof question !== "string") {
        throw new Error(
          `Input must contain a 'question' field with a string value. Available keys: ${Object.keys(input).join(", ")}`,
        );
      }

      // Process template variables in the question
      const templateContext: TemplateContext = {
        currentDate: new Date(),
      };

      const templateResult = TemplateProcessor.process(
        question,
        templateContext,
      );
      question = templateResult.processed;

      logger.debug("Template processing complete", {
        original: input.question,
        processed: question,
        replacements: templateResult.replacements.length,
      });

      // Generate a unique LangGraph thread ID for this evaluation
      const lcThreadId = `eval-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Create a RitaThread for this evaluation if repository is available
      let ritaThread: RitaThread | null = null;
      if (this.threadRepository) {
        logger.debug("Creating RitaThread for evaluation");

        const threadResult = await this.threadRepository.createThread({
          triggerType: RitaThreadTriggerType.Evaluation,
          hrCompanyId: authContext.companyId,
          status: RitaThreadStatus.Received,
          lcThreadId,
        });

        if (isOk(threadResult)) {
          ritaThread = unwrap(threadResult);
          logger.debug("RitaThread created", {
            id: ritaThread.id,
            lcThreadId: ritaThread.lcThreadId,
          });
        } else {
          logger.error("Failed to create RitaThread", {
            error: unwrapErr(threadResult).message,
          });
        }
      }

      // Create the graph input in the expected format
      const graphInput: GraphInput = {
        messages: [{ role: "user", content: question }],
        ...(input.preferredLanguage && {
          preferredLanguage: input.preferredLanguage,
        }),
        selectedCompanyId: authContext.companyId,
      };

      // Extract bearer token if needed
      let tokenWithoutBearer = authContext.token || "";
      if (tokenWithoutBearer.toLowerCase().startsWith("bearer ")) {
        tokenWithoutBearer = tokenWithoutBearer.slice(7).trim();
      }

      // Create graph instance with auth context - pass token WITHOUT Bearer
      const graph = await this.graphFactory({
        token: tokenWithoutBearer, // Pass token WITHOUT Bearer prefix
        userId: authContext.userId,
        companyId: authContext.companyId,
      });

      // Create a config object for the graph - using the RitaThread's lcThreadId
      // Match the OLD working implementation's config structure
      const config: GraphConfig = {
        configurable: {
          thread_id: ritaThread ? ritaThread.lcThreadId : lcThreadId,
          langgraph_auth_user: {
            token: tokenWithoutBearer, // Token WITHOUT Bearer
            user: {
              firstName: authContext.user?.firstName || "Evaluation",
              lastName: authContext.user?.lastName || "User",
              preferredLanguage:
                authContext.user?.preferredLanguage ||
                input.preferredLanguage ||
                "EN",
              company: {
                id: authContext.companyId,
              },
            },
          },
        },
      };

      logger.debug("Invoking graph with formatted input");

      // Invoke graph with the properly formatted input
      const result = await graph.invoke(graphInput, config);

      const messages = Array.isArray(result?.messages) ? result.messages : [];

      logger.debug("Graph invocation complete", {
        hasResult: !!result,
        hasMessages: Array.isArray(result?.messages),
        messageCount: messages.length,
      });

      // Extract the answer from the result
      const lastMessage =
        messages.length > 0 ? messages[messages.length - 1] : undefined;
      const answer = lastMessage?.content;

      // Fetch data change proposals from thread items if we have a thread
      const dataChangeProposals: Array<Record<string, unknown>> = [];
      let threadTitle: string | null = null;

      if (ritaThread && this.threadRepository) {
        const itemsResult = await this.threadRepository.getThreadItems(
          ritaThread.id,
        );
        if (isOk(itemsResult)) {
          const items = unwrap(itemsResult);
          for (const item of items) {
            const proposal = item.getDataChangeProposal();
            if (proposal) {
              dataChangeProposals.push(proposal.toPlainObject());
            }
          }
          logger.debug("Found data change proposals", {
            count: dataChangeProposals.length,
          });
        }

        // Get thread title if updated
        const threadResult = await this.threadRepository.findById(
          ritaThread.id,
        );
        if (isOk(threadResult)) {
          threadTitle = unwrap(threadResult).title || null;
        }
      }

      if (typeof answer !== "string") {
        logger.warn("Graph did not return a final message with string content");
        return {
          answer: "",
          dataChangeProposals,
          threadTitle,
          processedInput: question,
        };
      }

      return {
        answer,
        dataChangeProposals,
        threadTitle,
        processedInput: question,
      } satisfies TargetFunctionResult;
    };
  }

  private async createEvaluators(
    evaluatorDefinitions: EvaluatorDefinition[],
  ): Promise<EvaluatorFunction[]> {
    logger.debug("Creating evaluators", {
      definitionCount: evaluatorDefinitions.length,
    });

    const evaluatorFunctions: EvaluatorFunction[] = [];

    for (const definition of evaluatorDefinitions) {
      logger.debug("Creating evaluator function", {
        type: definition.type,
      });

      const evaluatorFunction = async ({
        inputs,
        outputs,
        referenceOutputs,
      }: {
        inputs?: Record<string, unknown>;
        outputs?: Record<string, unknown>;
        referenceOutputs?: Record<string, unknown>;
      }) => {
        logger.debug("Evaluator function invoked", {
          type: definition.type,
          hasInputs: !!inputs,
          hasOutputs: !!outputs,
          hasReferenceOutputs: !!referenceOutputs,
        });

        try {
          const evalInputs: EvaluatorInput = (inputs || {}) as EvaluatorInput;
          const evalOutputs: EvaluatorOutput = (outputs ||
            {}) as EvaluatorOutput;
          const evalReferenceOutputs: EvaluatorReferenceOutput =
            (referenceOutputs || {}) as EvaluatorReferenceOutput;

          if (definition.type === "DATA_CHANGE_PROPOSAL") {
            const result = await dataChangeProposalEvaluator.evaluate(
              {
                inputs: {
                  question: evalOutputs.processedInput || evalInputs.question,
                },
                outputs: {
                  answer: evalOutputs.answer,
                  dataChangeProposals: evalOutputs.dataChangeProposals || [],
                },
                referenceOutputs: evalReferenceOutputs as Record<
                  string,
                  unknown
                >,
              },
              {},
            );
            return result;
          }

          if (definition.type === "EXPECTED_OUTPUT") {
            const result = await expectedOutputEvaluator.evaluate(
              {
                inputs: {
                  question: evalOutputs.processedInput || evalInputs.question,
                },
                outputs: { answer: evalOutputs.answer },
                referenceOutputs: {
                  reference:
                    evalReferenceOutputs.expectedAnswer ||
                    evalReferenceOutputs.reference ||
                    "",
                },
              },
              {},
            );
            return result;
          }

          if (definition.type === "LANGUAGE_VERIFICATION") {
            const result = await languageVerificationEvaluator.evaluate(
              {
                inputs: {
                  question: evalOutputs.processedInput || evalInputs.question,
                  preferredLanguage: evalInputs.preferredLanguage,
                },
                outputs: {
                  answer: evalOutputs.answer,
                  preferredLanguage: evalOutputs.preferredLanguage,
                },
                referenceOutputs: {
                  expectedLanguage: evalReferenceOutputs.expectedLanguage,
                },
              },
              {},
            );
            return result;
          }

          if (definition.type === "TITLE_GENERATION") {
            const result = await titleGenerationEvaluator.evaluate(
              {
                inputs: {
                  question: evalOutputs.processedInput || evalInputs.question,
                  preferredLanguage: evalInputs.preferredLanguage,
                },
                outputs: {
                  answer: evalOutputs.answer,
                  threadTitle: evalOutputs.threadTitle,
                  threadId: evalOutputs.threadId as string | undefined,
                },
                referenceOutputs: {
                  expectedLanguage: evalReferenceOutputs.expectedLanguage,
                },
              },
              {},
            );
            return result;
          }

          if (definition.type === "PROPOSAL_QUOTE_VERIFICATION") {
            const result = await proposalQuoteVerificationEvaluator.evaluate(
              {
                inputs: {
                  question: evalOutputs.processedInput || evalInputs.question,
                },
                outputs: {
                  answer: evalOutputs.answer,
                  dataChangeProposals: evalOutputs.dataChangeProposals || [],
                },
                referenceOutputs: {},
              },
              {},
            );
            return result;
          }

          logger.warn("Unknown evaluator type", { type: definition.type });
          return {
            key: definition.type.toLowerCase(),
            score: 0,
            comment: `Unknown evaluator type: ${definition.type}`,
          };
        } catch (error) {
          logger.error("Evaluator execution failed", {
            type: definition.type,
            error: error instanceof Error ? error.message : String(error),
          });

          return {
            key: definition.type.toLowerCase(),
            score: 0,
            comment: `Evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      };

      evaluatorFunctions.push(evaluatorFunction);
    }

    logger.info("Created evaluator functions", {
      count: evaluatorFunctions.length,
      types: evaluatorDefinitions.map((d) => d.type),
    });

    return evaluatorFunctions;
  }
}
