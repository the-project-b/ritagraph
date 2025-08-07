import {
  createRitaGraph,
  RitaThreadStatus,
  RitaThreadTriggerType,
} from "@the-project-b/rita-graphs";
import { createLogger } from '@the-project-b/logging';
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { getAuthUser } from "../security/auth.js";

import { GraphQLErrors } from "../graphql/errors.js";
import type { GraphQLContext } from "../types/context.js";
import type {
  DatasetExperiment,
  DeleteExperimentRunsInput,
  DeleteExperimentRunsResult,
  ExperimentDetails,
  Feedback,
  GetDatasetExperimentsInput,
  GetExperimentDetailsInput,
  GraphName,
  Run,
  RunEvaluationInput,
} from "../types/index.js";

// Define types for prompt information
export interface PromptInfo {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  numCommits: number;
  numLikes: number;
  updatedAt: string;
  owner: string;
  fullName: string;
  tags?: string[];
}

export interface PromptWithContent {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  owner: string;
  fullName: string;
  promptData: any; // The actual prompt template/data
  metadata?: Record<string, any>;
}

// Create logger instance
const logger = createLogger({ service: 'experiments' }).child({ module: 'LangSmithService' });

// Create graph with auth - wrap in async to match factory signature
const create_rita_graph = async () => createRitaGraph(getAuthUser)();

export class LangSmithService {
  private client: Client;
  private graphFactoryMap: Record<GraphName, () => Promise<any>>;

  constructor() {
    this.client = new Client();

    // Initialize the graph factory map
    this.graphFactoryMap = {
      rita: create_rita_graph,
    };
  }

  /**
   * Gets the LangSmith client instance
   * @returns Client - The LangSmith client
   */
  public getClient(): Client {
    return this.client;
  }

  /**
   * Gets the list of available graph names
   * @returns GraphName[] - Array of available graph names
   */
  public getAvailableGraphs(): GraphName[] {
    return Object.keys(this.graphFactoryMap) as GraphName[];
  }

  public async runEvaluation(
    input: RunEvaluationInput,
    context: GraphQLContext,
  ) {
    const {
      graphName,
      datasetName,
      evaluators,
      experimentPrefix,
      selectedCompanyId,
      maxConcurrency,
    } = input;

    if (!context.user) {
      throw GraphQLErrors.UNAUTHENTICATED;
    }

    const graphFactory = this.graphFactoryMap[graphName];
    if (!graphFactory) {
      throw new Error(`Graph factory not found for graph: ${graphName}`);
    }

    // Create Rita thread in database BEFORE running evaluations
    const { createGraphQLClient } = await import("../graphql/client.js");
    const graphqlClient = createGraphQLClient(context.token || "");

    // Generate the LangGraph thread ID that will be used for all evaluations
    const lcThreadId = `eval-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const threadResult = await graphqlClient.createRitaThread({
      input: {
        title: `Evaluation - ${experimentPrefix || graphName}`,
        triggerType: RitaThreadTriggerType.Evaluation,
        hrCompanyId: selectedCompanyId,
        status: RitaThreadStatus.Received,
        lcThreadId, // Use the same thread ID for LangGraph
      },
    });

    const ritaThread = threadResult.createRitaThread;
    logger.info(
      `🧵 RitaThread created: ${ritaThread.id} (lc: ${ritaThread.lcThreadId})`,
      { 
        threadId: ritaThread.id, 
        lcThreadId: ritaThread.lcThreadId,
        operation: 'createRitaThread',
        graphName,
        datasetName,
        experimentPrefix: experimentPrefix || graphName,
        selectedCompanyId,
        triggerType: RitaThreadTriggerType.Evaluation
      }
    );

    const target = async (inputs: Record<string, any>) => {
      const question = inputs.question;

      const examplePreferredLanguage = inputs.preferredLanguage;

      const graphInput = {
        messages: [{ role: "user", content: question }],
        ...(examplePreferredLanguage && {
          preferredLanguage: examplePreferredLanguage,
        }),
      };
      const graph = await graphFactory();

      let token = context.token || "";
      if (token.toLowerCase().startsWith("bearer ")) {
        token = token.slice(7).trim();
      }

      const config = {
        configurable: {
          thread_id: ritaThread.lcThreadId, // Use the LangGraph thread ID for all evaluations
          langgraph_auth_user: {
            token,
            user: {
              firstName: context.user.me.firstName,
              lastName: context.user.me.lastName,
              preferredLanguage:
                examplePreferredLanguage || context.user.me.preferredLanguage,
              company: {
                id: selectedCompanyId,
              },
            },
          },
        },
      };

      const result: any = await graph.invoke(graphInput, config);

      const lastMessage = Array.isArray(result?.messages)
        ? result.messages[result.messages.length - 1]
        : undefined;
      const answer = lastMessage?.content;

      if (typeof answer !== "string") {
        logger.warn(
          `[${ritaThread.id}] Graph did not return a final message with string content`,
          {
            threadId: ritaThread.id,
            lcThreadId: ritaThread.lcThreadId,
            operation: 'evaluateTarget',
            graphName,
            messageType: typeof answer,
            hasMessages: Array.isArray(result?.messages),
            messageCount: result?.messages?.length || 0
          }
        );
        return {
          answer: "",
          dataChangeProposals: [],
        };
      }

      // Fetch data change proposals from the database after graph execution
      const threadItemsResult = await graphqlClient.getThreadItemsByThreadId({
        threadId: ritaThread.id,
      });

      const dataChangeProposals = [];
      if (threadItemsResult?.thread?.threadItems) {
        for (const item of threadItemsResult.thread.threadItems) {
          try {
            const data =
              typeof item.data === "string" ? JSON.parse(item.data) : item.data;
            if (data.type === "DATA_CHANGE_PROPOSAL" && data.proposal) {
              dataChangeProposals.push({
                changedField: data.proposal.changedField,
                newValue: data.proposal.newValue,
                mutationQueryPropertyPath:
                  data.proposal.mutationQuery?.propertyPath,
                relatedUserId: data.proposal.relatedUserId,
              });
            }
          } catch (e) {
            // Skip invalid JSON items
          }
        }
      }

      return {
        answer,
        dataChangeProposals,
      };
    };

    // Prepare evaluators, potentially fetching prompts from LangSmith
    const { createEvaluator } = await import("../evaluators/core/factory.js");

    const evaluatorPromises = evaluators.map(async (evaluatorInput) => {
      let promptToUse = evaluatorInput.customPrompt;

      if (evaluatorInput.langsmithPromptName && !evaluatorInput.customPrompt) {
        try {
          const promptData = await this.pullPrompt(
            evaluatorInput.langsmithPromptName,
          );
          promptToUse = this.convertPromptToText(promptData.promptData);
        } catch (error) {
          logger.error(
            `Failed to fetch prompt ${evaluatorInput.langsmithPromptName}:`,
            error,
            {
              operation: 'fetchLangsmithPrompt',
              promptName: evaluatorInput.langsmithPromptName,
              evaluatorType: evaluatorInput.type,
              hasCustomPrompt: !!evaluatorInput.customPrompt,
              errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
              errorMessage: error instanceof Error ? error.message : String(error)
            }
          );
          throw new Error(
            `Failed to fetch LangSmith prompt "${evaluatorInput.langsmithPromptName}": ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      return createEvaluator(
        evaluatorInput.type,
        promptToUse,
        evaluatorInput.model,
        evaluatorInput.referenceKey,
      );
    });

    const evaluationConfig = {
      evaluators: await Promise.all(evaluatorPromises),
      experimentPrefix: experimentPrefix || `eval-${graphName}`,
      // Set concurrency for concurrent processing of dataset examples
      maxConcurrency: maxConcurrency || 10, // Increased default for better concurrency
    };

    const experimentResults: any = await evaluate(target as any, {
      data: datasetName,
      ...evaluationConfig,
    });

    const results: any[] = [];
    for (const item of experimentResults.results ?? []) {
      const run = item.run;
      const evalResults = item.evaluationResults;
      if (!run) continue;

      const scores = (evalResults?.results ?? []).map((score: any) => ({
        key: score.key,
        score: String(score.score),
        comment: score.comment,
      }));

      const startTime = run.start_time ?? 0;
      const endTime = run.end_time ?? 0;
      const latency = endTime > 0 && startTime > 0 ? endTime - startTime : 0;
      const totalTokens = run.total_tokens ?? 0;

      results.push({
        id: run.id,
        inputs: JSON.stringify(run.inputs),
        outputs: run.outputs ? JSON.stringify(run.outputs) : null,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        latency,
        totalTokens,
        scores,
      });
    }

    const manager = experimentResults?.manager;
    const langsmithClient = manager?.client;
    const experiment = manager?._experiment;
    const experimentName = experiment?.name ?? "Unnamed Experiment";

    const webUrl = langsmithClient?.webUrl;
    const tenantId = langsmithClient?._tenantId;
    const datasetId = experiment?.reference_dataset_id;
    const experimentId = experiment?.id;

    let url = "";
    if (webUrl && tenantId && datasetId && experimentId) {
      url = `${webUrl}/o/${tenantId}/datasets/${datasetId}/compare?selectedSessions=${experimentId}`;
    }
    if (!url) {
      logger.warn(
        "Could not construct LangSmith results URL, providing fallback",
        {
          operation: 'constructResultsUrl',
          hasWebUrl: !!webUrl,
          hasTenantId: !!tenantId,
          hasDatasetId: !!datasetId,
          hasExperimentId: !!experimentId,
          experimentName,
          graphName,
          datasetName
        }
      );
      url = webUrl ? `${webUrl}/projects` : "URL not available";
    }

    return {
      url,
      experimentName,
      experimentId: experimentId || "unknown",
      results,
    };
  }

  public async getDatasetExperiments(
    input: GetDatasetExperimentsInput,
  ): Promise<{
    experiments: DatasetExperiment[];
    total: number;
  }> {
    const {
      datasetId,
      offset = 0,
      limit = 10,
      sortBy = "start_time",
      sortByDesc = true,
    } = input;

    // Build the URL with query parameters
    // Use environment variable for API URL, defaulting to US region
    let baseUrl =
      process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";

    // Handle EU region URL format - ensure we use the correct base URL
    if (baseUrl.includes("eu.api.smith.langchain.com")) {
      baseUrl = "https://eu.api.smith.langchain.com";
    }

    baseUrl = baseUrl.replace(/\/api\/v1\/?$/, "");

    const url = new URL("/api/v1/sessions", baseUrl);
    url.searchParams.set("reference_dataset", datasetId);
    url.searchParams.set("offset", offset.toString());
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("sort_by", sortBy);
    url.searchParams.set("sort_by_desc", sortByDesc.toString());
    url.searchParams.set("use_approx_stats", "false");

    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      throw new Error("LANGSMITH_API_KEY environment variable is required");
    }

    const headers = {
      "x-api-key": apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          `Failed to fetch experiments: ${response.status} ${response.statusText}`,
          undefined,
          {
            operation: 'getDatasetExperiments',
            datasetId,
            httpStatus: response.status,
            httpStatusText: response.statusText,
            offset,
            limit,
            sortBy,
            sortByDesc,
            endpoint: url.toString()
          }
        );

        throw new Error(
          `Failed to fetch experiments: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const contentType = response.headers.get("content-type");

      if (contentType?.includes("text/event-stream")) {
        return await this.parseStreamingResponse(response);
      } else {
        const responseText = await response.text();

        try {
          const data = JSON.parse(responseText);

          const totalFromHeader = response.headers.get("x-pagination-total");
          const total = totalFromHeader ? parseInt(totalFromHeader, 10) : 0;

          return this.transformSessionsResponse(data, total);
        } catch (parseError) {
          logger.error("Failed to parse JSON response:", parseError, {
            operation: 'getDatasetExperiments',
            datasetId,
            responseType: 'streaming',
            errorType: parseError instanceof Error ? parseError.constructor.name : 'UnknownError'
          });
          throw new Error(`Failed to parse response as JSON: ${parseError}`);
        }
      }
    } catch (error) {
      logger.error("Error in getDatasetExperiments:", error, {
        operation: 'getDatasetExperiments',
        datasetId,
        offset,
        limit,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      throw new Error(
        `Failed to fetch experiments: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async parseStreamingResponse(response: Response): Promise<{
    experiments: DatasetExperiment[];
    total: number;
  }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Unable to read streaming response");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let experiments: DatasetExperiment[] = [];
    let total = 0;
    let eventCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            eventCount++;
            try {
              const jsonData = line.slice(6);

              const parsedData = JSON.parse(jsonData);

              if (parsedData.patch && Array.isArray(parsedData.patch)) {
                for (const patch of parsedData.patch) {
                  if (
                    patch.op === "add" &&
                    patch.path === "" &&
                    patch.value?.rows
                  ) {
                    experiments = this.transformRows(patch.value.rows);
                    total = patch.value.total || 0;
                  } else if (
                    patch.op === "add" &&
                    patch.path.startsWith("/rows/")
                  ) {
                    this.applyRowUpdate(experiments, patch);
                  }
                }
              }
            } catch (parseError) {
              logger.warn("Failed to parse SSE data:", {
                operation: 'parseStreamingResponse',
                lineContent: line.substring(0, 100),
                errorType: parseError instanceof Error ? parseError.constructor.name : 'UnknownError'
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error("Error parsing streaming response:", error, {
        operation: 'parseStreamingResponse',
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      reader.releaseLock();
    }

    return { experiments, total };
  }

  private transformSessionsResponse(
    data: any,
    total: number,
  ): {
    experiments: DatasetExperiment[];
    total: number;
  } {
    // Handle direct array response (current API format)
    if (Array.isArray(data)) {
      return {
        experiments: this.transformRows(data),
        total,
      };
    }

    // Handle object with rows property (alternative format)
    if (data && data.rows && Array.isArray(data.rows)) {
      return {
        experiments: this.transformRows(data.rows),
        total,
      };
    }

    logger.warn("Unknown response format, returning empty", {
      operation: 'transformSessionsResponse',
      hasData: !!data,
      dataType: typeof data,
      hasProjectSessions: !!data?.project_sessions,
      hasCursors: !!data?.cursors
    });
    return { experiments: [], total: 0 };
  }

  private transformRows(rows: any[]): DatasetExperiment[] {
    return rows.map((row) => {
      return {
        id: row.id,
        name: row.name,
        startTime: row.start_time,
        endTime: row.end_time ?? undefined,
        description: row.description ?? undefined,
        runCount: row.run_count ?? undefined,
        totalTokens: row.total_tokens ?? undefined,
        promptTokens: row.prompt_tokens ?? undefined,
        completionTokens: row.completion_tokens ?? undefined,
        totalCost: row.total_cost ?? undefined,
        promptCost: row.prompt_cost ?? undefined,
        completionCost: row.completion_cost ?? undefined,
        errorRate: row.error_rate ?? undefined,
        latencyP50: row.latency_p50 ?? undefined,
        latencyP99: row.latency_p99 ?? undefined,
        feedbackStats: row.feedback_stats
          ? this.parseFeedbackStats(row.feedback_stats)
          : undefined,
        testRunNumber: row.test_run_number ?? undefined,
        metadata: row.extra?.metadata ?? undefined,
      };
    });
  }

  private parseFeedbackStats(feedbackStatsRaw: any): any {
    try {
      if (typeof feedbackStatsRaw === "string") {
        const parsed = JSON.parse(feedbackStatsRaw);
        // Transform the parsed object to match GraphQL schema expectations
        const transformed: any = {};

        for (const [key, value] of Object.entries(parsed)) {
          if (value && typeof value === "object") {
            const valueObj = value as any;
            const transformedValue = {
              ...valueObj,
              // Stringify the values field to match GraphQL String type
              values: valueObj.values
                ? JSON.stringify(valueObj.values)
                : undefined,
            };
            transformed[key] = transformedValue;

            // Legacy mapping: map expected_output to correctness for backward compatibility
            if (key === "expected_output") {
              transformed["correctness"] = transformedValue;
            }
          }
        }

        return transformed;
      }
      // If it's already an object, transform it the same way
      if (typeof feedbackStatsRaw === "object" && feedbackStatsRaw !== null) {
        const transformed: any = {};

        for (const [key, value] of Object.entries(feedbackStatsRaw)) {
          if (value && typeof value === "object") {
            const valueObj = value as any;
            const transformedValue = {
              ...valueObj,
              // Stringify the values field to match GraphQL String type
              values: valueObj.values
                ? JSON.stringify(valueObj.values)
                : undefined,
            };
            transformed[key] = transformedValue;

            // Legacy mapping: map expected_output to correctness for backward compatibility
            if (key === "expected_output") {
              transformed["correctness"] = transformedValue;
            }
          }
        }

        return transformed;
      }

      return feedbackStatsRaw;
    } catch (error) {
      logger.error("Failed to parse feedback stats:", error, {
        operation: 'parseFeedbackStats',
        rawStatsLength: feedbackStatsRaw?.length,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });
      return undefined;
    }
  }

  private applyRowUpdate(experiments: DatasetExperiment[], patch: any): void {
    // Extract row index from path like "/rows/0/run_count"
    const pathMatch = patch.path.match(/^\/rows\/(\d+)\/(.+)$/);
    if (!pathMatch) return;

    const rowIndex = parseInt(pathMatch[1], 10);
    const fieldPath = pathMatch[2];

    if (rowIndex >= 0 && rowIndex < experiments.length) {
      const experiment = experiments[rowIndex];

      // Map field paths to experiment properties
      switch (fieldPath) {
        case "run_count":
          experiment.runCount = patch.value;
          break;
        case "total_tokens":
          experiment.totalTokens = patch.value;
          break;
        case "prompt_tokens":
          experiment.promptTokens = patch.value;
          break;
        case "completion_tokens":
          experiment.completionTokens = patch.value;
          break;
        case "total_cost":
          experiment.totalCost = patch.value;
          break;
        case "prompt_cost":
          experiment.promptCost = patch.value;
          break;
        case "completion_cost":
          experiment.completionCost = patch.value;
          break;
        case "error_rate":
          experiment.errorRate = patch.value;
          break;
        case "latency_p50":
          experiment.latencyP50 = patch.value;
          break;
        case "latency_p99":
          experiment.latencyP99 = patch.value;
          break;
        case "feedback_stats":
          experiment.feedbackStats = patch.value;
          break;
        case "last_run_start_time":
          // This could be used to update some timestamp if needed
          break;
        default:
          // Handle any other fields if needed
          break;
      }
    }
  }

  public async getExperimentDetails(
    input: GetExperimentDetailsInput,
  ): Promise<ExperimentDetails> {
    const { experimentId, offset = 0, limit = 50 } = input;

    // Build the API URL
    let baseUrl =
      process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    if (baseUrl.includes("eu.api.smith.langchain.com")) {
      baseUrl = "https://eu.api.smith.langchain.com";
    }
    baseUrl = baseUrl.replace(/\/api\/v1\/?$/, "");

    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      throw new Error("LANGSMITH_API_KEY environment variable is required");
    }

    try {
      // 1. Get the experiment/session details
      const sessionUrl = `${baseUrl}/api/v1/sessions/${experimentId}`;

      const sessionResponse = await fetch(sessionUrl, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!sessionResponse.ok) {
        throw new Error(
          `Failed to fetch experiment details: ${sessionResponse.status} ${sessionResponse.statusText}`,
        );
      }

      const sessionData = await sessionResponse.json();

      // Transform session data to experiment format
      const experiment: DatasetExperiment = {
        id: sessionData.id,
        name: sessionData.name,
        startTime: sessionData.start_time,
        endTime: sessionData.end_time ?? undefined,
        description: sessionData.description ?? undefined,
        runCount: sessionData.run_count ?? undefined,
        totalTokens: sessionData.total_tokens ?? undefined,
        promptTokens: sessionData.prompt_tokens ?? undefined,
        completionTokens: sessionData.completion_tokens ?? undefined,
        totalCost: sessionData.total_cost ?? undefined,
        promptCost: sessionData.prompt_cost ?? undefined,
        completionCost: sessionData.completion_cost ?? undefined,
        errorRate: sessionData.error_rate ?? undefined,
        latencyP50: sessionData.latency_p50 ?? undefined,
        latencyP99: sessionData.latency_p99 ?? undefined,
        feedbackStats: sessionData.feedback_stats
          ? this.parseFeedbackStats(sessionData.feedback_stats)
          : undefined,
        testRunNumber: sessionData.test_run_number ?? undefined,
        metadata: sessionData.extra?.metadata ?? undefined,
      };

      // 2. Get the runs for this experiment using the correct endpoint
      // Extract dataset ID from session data to use the proper endpoint
      const datasetId =
        sessionData.reference_dataset_id || sessionData.reference_dataset;

      if (!datasetId) {
        throw new Error("Dataset ID not found in experiment/session data");
      }

      const runsUrl = `${baseUrl}/api/v1/datasets/${datasetId}/runs`;

      const requestPayload = {
        session_ids: [experimentId],
        offset,
        limit,
        preview: true,
        filters: {},
      };

      const runsResponse = await fetch(runsUrl, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      if (!runsResponse.ok) {
        const errorText = await runsResponse.text();
        logger.error("Runs API error:", undefined, {
          operation: 'getExperimentDetails',
          experimentId: input.experimentId,
          httpStatus: runsResponse.status,
          httpStatusText: runsResponse.statusText,
          errorText,
          offset: input.offset || 0,
          limit: input.limit || 10,
          endpoint: runsUrl.toString()
        });
        throw new Error(
          `Failed to fetch runs: ${runsResponse.status} ${runsResponse.statusText}`,
        );
      }

      const runsData = await runsResponse.json();

      // The response format from your example shows it's an array of objects, each with a 'runs' array
      let allRuns: any[] = [];
      let totalRunsCount = 0;

      if (Array.isArray(runsData)) {
        // Extract runs from each object in the response array
        for (const item of runsData) {
          if (item.runs && Array.isArray(item.runs)) {
            allRuns.push(...item.runs);
          }
        }
        totalRunsCount = allRuns.length;
      } else if (runsData.runs && Array.isArray(runsData.runs)) {
        // Fallback for different response format
        allRuns = runsData.runs;
        totalRunsCount = runsData.total_count || allRuns.length;
      }

      const runs = allRuns.map((run: any): Run => {
        // Calculate latency if not provided
        let calculatedLatency = run.latency;
        if (!calculatedLatency && run.start_time && run.end_time) {
          const startTime = new Date(run.start_time).getTime();
          const endTime = new Date(run.end_time).getTime();
          calculatedLatency = endTime - startTime; // in milliseconds
        }

        return {
          id: run.id,
          name: run.name || "",
          runType: run.run_type || "",
          startTime: run.start_time,
          endTime: run.end_time ?? undefined,
          latency: calculatedLatency ?? undefined,
          inputs: run.inputs || undefined,
          outputs: run.outputs || undefined,
          inputsPreview: run.inputs_preview ?? undefined,
          outputsPreview: run.outputs_preview ?? undefined,
          error: run.error ?? undefined,
          parentRunId: run.parent_run_id ?? undefined,
          isRoot: run.is_root || false,
          totalTokens: run.total_tokens ?? undefined,
          promptTokens: run.prompt_tokens ?? undefined,
          completionTokens: run.completion_tokens ?? undefined,
          totalCost: run.total_cost ?? undefined,
          promptCost: run.prompt_cost ?? undefined,
          completionCost: run.completion_cost ?? undefined,
          metadata: run.extra ?? undefined,
          tags: run.tags ?? undefined,
          referenceExampleId: run.reference_example_id ?? undefined,
          traceId: run.trace_id ?? undefined,
          dottedOrder: run.dotted_order ?? undefined,
          status: run.status ?? undefined,
          executionOrder: run.execution_order ?? undefined,
          feedbackStats: run.feedback_stats
            ? this.parseFeedbackStats(run.feedback_stats)
            : undefined,
          appPath: run.app_path ?? undefined,
          sessionId: run.session_id ?? undefined,
        };
      });

      return {
        experiment,
        runs,
        totalRuns: totalRunsCount,
      };
    } catch (error) {
      logger.error("Error getting experiment details:", error, {
        operation: 'getExperimentDetails',
        experimentId: input.experimentId,
        offset: input.offset || 0,
        limit: input.limit || 10,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  public async getFeedbackForRun(runId: string): Promise<Feedback[]> {
    // Build the API URL
    let baseUrl =
      process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    if (baseUrl.includes("eu.api.smith.langchain.com")) {
      baseUrl = "https://eu.api.smith.langchain.com";
    }
    baseUrl = baseUrl.replace(/\/api\/v1\/?$/, "");

    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      throw new Error("LANGSMITH_API_KEY environment variable is required");
    }

    try {
      const feedbackUrl = `${baseUrl}/feedback?run=${runId}`;

      const response = await fetch(feedbackUrl, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Feedback API error:", undefined, {
          operation: 'getFeedbackForRun',
          runId,
          httpStatus: response.status,
          httpStatusText: response.statusText,
          errorText,
          endpoint: feedbackUrl.toString()
        });
        throw new Error(
          `Failed to fetch feedback: ${response.status} ${response.statusText}`,
        );
      }

      const feedbackData = await response.json();

      // Transform the feedback data to match our interface
      const feedback: Feedback[] = (feedbackData || []).map(
        (item: any): Feedback => ({
          id: item.id,
          createdAt: item.created_at,
          modifiedAt: item.modified_at,
          key: item.key,
          score: item.score ?? undefined,
          value: item.value ?? undefined,
          comment: item.comment ?? undefined,
          correction: item.correction ?? undefined,
          feedbackGroupId: item.feedback_group_id ?? undefined,
          comparativeExperimentId: item.comparative_experiment_id ?? undefined,
          runId: item.run_id,
          sessionId: item.session_id,
          traceId: item.trace_id,
          startTime: item.start_time,
          feedbackSource: {
            type: item.feedback_source.type,
            metadata: item.feedback_source.metadata ?? undefined,
            userId: item.feedback_source.user_id ?? undefined,
            userName: item.feedback_source.user_name ?? undefined,
          },
          extra: item.extra ?? undefined,
        }),
      );

      return feedback;
    } catch (error) {
      logger.error("Error getting feedback for run:", error, {
        operation: 'getFeedbackForRun',
        runId,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  public async deleteExperimentRuns(
    input: DeleteExperimentRunsInput,
  ): Promise<DeleteExperimentRunsResult> {
    const { experimentId } = input;

    logger.warn("LangSmith does not support permanent run deletion via API", {
      operation: 'deleteExperimentRuns',
      experimentId,
      limitation: 'api_not_supported'
    });

    // Build the API URL
    let baseUrl =
      process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    if (baseUrl.includes("eu.api.smith.langchain.com")) {
      baseUrl = "https://eu.api.smith.langchain.com";
    }
    baseUrl = baseUrl.replace(/\/api\/v1\/?$/, "");

    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      throw new Error("LANGSMITH_API_KEY environment variable is required");
    }

    try {
      // First, let's get information about the experiment to confirm it exists
      const sessionUrl = `${baseUrl}/api/v1/sessions/${experimentId}`;

      const checkResponse = await fetch(sessionUrl, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          Accept: "application/json",
        },
      });

      if (!checkResponse.ok) {
        if (checkResponse.status === 404) {
          return {
            success: false,
            message: `Experiment with ID ${experimentId} not found`,
          };
        }
        throw new Error(
          `Failed to check experiment: ${checkResponse.status} ${checkResponse.statusText}`,
        );
      }

      const experimentData = await checkResponse.json();

      // Get all runs in the experiment - handle cursor-based pagination
      const allTraceIds: string[] = [];
      const limit = 100; // API maximum
      let cursor: string | null = null;
      let pageCount = 0;

      do {
        const runsQueryUrl = `${baseUrl}/api/v1/runs/query`;

        const requestBody: any = {
          session: [experimentId],
          limit,
          is_root: true, // Only get root runs (no parent runs)
        };

        // Add cursor for pagination if we have one
        if (cursor) {
          requestBody.cursor = cursor;
        }

        const runsQueryResponse = await fetch(runsQueryUrl, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!runsQueryResponse.ok) {
          const errorText = await runsQueryResponse.text();
          logger.error("Runs query API error:", undefined, {
            operation: 'deleteExperimentRuns',
            experimentId,
            httpStatus: runsQueryResponse.status,
            httpStatusText: runsQueryResponse.statusText,
            errorText,
            pageCount,
            currentCursor: cursor,
            endpoint: runsQueryUrl
          });
          throw new Error(
            `Failed to query runs: ${runsQueryResponse.status} ${runsQueryResponse.statusText}`,
          );
        }

        const runsData = await runsQueryResponse.json();
        const batchTraceIds = runsData.runs?.map((run: any) => run.id) || [];

        allTraceIds.push(...batchTraceIds);

        // Get the next cursor for pagination
        cursor = runsData.cursors?.next || null;
        pageCount++;

        // Safety break - avoid infinite loop
        if (pageCount > 100) {
          logger.warn("Breaking pagination loop at 100 pages for safety", {
            operation: 'deleteExperimentRuns',
            experimentId,
            pageCount,
            totalRunsCollected: allTraceIds.length,
            safetyLimit: 100
          });
          break;
        }
      } while (cursor);

      if (allTraceIds.length === 0) {
        return {
          success: true,
          message: `No runs found for experiment "${experimentData.name}" - it may already be empty`,
          deletedCount: 0,
        };
      }

      // Delete runs in batches (API might have limits on trace_ids array size)
      const deleteUrl = `${baseUrl}/api/v1/runs/delete`;
      const batchSize = 100; // Delete in batches
      let totalDeleted = 0;

      for (let i = 0; i < allTraceIds.length; i += batchSize) {
        const batchTraceIds = allTraceIds.slice(i, i + batchSize);

        const deleteResponse = await fetch(deleteUrl, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: experimentId,
            trace_ids: batchTraceIds,
          }),
        });

        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text();
          logger.error("Delete API error:", undefined, {
            operation: 'deleteExperimentRuns',
            experimentId,
            httpStatus: deleteResponse.status,
            httpStatusText: deleteResponse.statusText,
            errorText,
            batchIndex: i,
            batchSize: batchTraceIds.length,
            totalBatches: Math.ceil(allTraceIds.length / batchSize),
            endpoint: deleteUrl.toString()
          });
          throw new Error(
            `Failed to delete runs batch: ${deleteResponse.status} ${deleteResponse.statusText}`,
          );
        }

        totalDeleted += batchTraceIds.length;

        // Add a small delay between batches to be nice to the API
        if (i + batchSize < allTraceIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      return {
        success: true,
        message: `Attempted to delete ${totalDeleted} runs for experiment "${experimentData.name}". Note: LangSmith may not permanently delete runs and they may remain visible in the dashboard. For true deletion, contact LangSmith support.`,
        deletedCount: totalDeleted,
      };
    } catch (error) {
      logger.error("Error deleting experiment runs:", error, {
        operation: 'deleteExperimentRuns',
        experimentId,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      return {
        success: false,
        message: `Failed to delete experiment runs: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * List available prompts from LangSmith
   * @param query Optional tag name to filter prompts by (filters by tags only, not title/description)
   * @param isPublic Whether to search public prompts (default: false for private workspace prompts)
   * @returns List of prompt information
   */
  public async listPrompts(
    query?: string,
    isPublic: boolean = false,
  ): Promise<PromptInfo[]> {
    try {
      // Use the LangSmith client to list prompts
      // Note: LangSmith SDK doesn't support tag filtering directly, so we fetch all and filter client-side
      const promptsIterator = this.client.listPrompts({
        isPublic,
        // Don't pass query to SDK - we'll filter by tags after fetching
      } as any);

      const prompts: any[] = [];
      for await (const prompt of promptsIterator) {
        prompts.push(prompt);
      }

      // Filter by tags if query is provided
      const filteredPrompts = query
        ? prompts.filter((prompt) => {
            const tags = prompt.tags || [];
            return tags.some((tag: string) =>
              tag.toLowerCase().includes(query.toLowerCase()),
            );
          })
        : prompts;

      // Transform the response to our PromptInfo format
      return filteredPrompts.map((prompt) => {
        return {
          id: prompt.id,
          name: prompt.repo_handle,
          description: prompt.description || undefined,
          isPublic: prompt.is_public,
          numCommits: prompt.num_commits,
          numLikes: prompt.num_likes,
          updatedAt: prompt.updated_at,
          owner: prompt.owner || "system",
          fullName: prompt.full_name,
          tags: prompt.tags || [],
        };
      });
    } catch (error) {
      logger.error("Error listing prompts:", error, {
        operation: 'listPrompts',
        query,
        isPublic,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw new Error(
        `Failed to list prompts: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Pull a specific prompt from LangSmith
   * @param promptName The name or full handle of the prompt (e.g., 'joke-generator' or 'owner/joke-generator')
   * @param includeModel Whether to include the model configuration in the response
   * @returns The prompt content and metadata
   */
  public async pullPrompt(
    promptName: string,
    includeModel: boolean = false,
  ): Promise<PromptWithContent> {
    try {
      // Use the LangSmith client to pull the prompt
      // The method is _pullPrompt (with underscore) according to the error
      const promptData = await (this.client as any)._pullPrompt(promptName, {
        includeModel,
      });

      // Extract metadata from the prompt if available
      const metadata = promptData._metadata || {};

      // Parse the prompt name to extract owner if not provided
      let owner = "";
      let name = promptName;
      if (promptName.includes("/")) {
        const parts = promptName.split("/");
        owner = parts[0];
        name = parts.slice(1).join("/");
      }

      return {
        id: metadata.id || promptName,
        name,
        description: metadata.description,
        isPublic: metadata.is_public || false,
        owner: owner || metadata.owner || "",
        fullName: promptName,
        promptData,
        metadata,
      };
    } catch (error) {
      logger.error("Error pulling prompt:", error, {
        operation: 'pullPrompt',
        promptName,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw new Error(
        `Failed to pull prompt "${promptName}": ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Convert a LangSmith prompt to plain text format
   * @param promptData The prompt data from pullPrompt
   * @returns The prompt as a plain text string
   */
  public convertPromptToText(promptData: any): string {
    try {
      let promptText = "";
      let parsedData = promptData;

      // If it's a JSON string, parse it first
      if (typeof promptData === "string") {
        try {
          parsedData = JSON.parse(promptData);
        } catch (parseError) {
          // If parsing fails, treat it as a plain string template
          return promptData;
        }
      }

      // Handle serialized LangChain PromptTemplate objects
      if (parsedData.lc && parsedData.kwargs && parsedData.kwargs.template) {
        promptText = parsedData.kwargs.template;
      }
      // If it's a ChatPromptTemplate or similar
      else if (parsedData.messages && Array.isArray(parsedData.messages)) {
        promptText = parsedData.messages
          .map((msg: any) => {
            if (typeof msg === "string") return msg;
            if (msg.content) return msg.content;
            if (msg.prompt && msg.prompt.template) return msg.prompt.template;
            return JSON.stringify(msg);
          })
          .join("\n\n");
      }
      // If it has a template property directly
      else if (parsedData.template) {
        promptText = parsedData.template;
      }
      // // If it's a prompt with input_variables and template
      // else if (parsedData.input_variables && parsedData.template) {
      //   promptText = parsedData.template;
      // }
      // Default: stringify the whole thing
      else {
        logger.warn("Unknown prompt format, using JSON representation", {
          operation: 'convertPromptToText',
          hasMessages: !!parsedData.messages,
          hasTemplate: !!parsedData.template,
          hasInput: !!parsedData.input,
          dataKeys: Object.keys(parsedData || {})
        });
        promptText = JSON.stringify(parsedData, null, 2);
      }

      return promptText;
    } catch (error) {
      logger.error("Error converting prompt to text:", error, {
        operation: 'convertPromptToText',
        promptDataType: typeof promptData,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw new Error(
        `Failed to convert prompt to text: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
