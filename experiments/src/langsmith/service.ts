import {
  rita,
} from '@the-project-b/rita-v2-graphs';
import { Client } from 'langsmith';
import { evaluate } from 'langsmith/evaluation';

import type { GraphQLContext } from '../types/context.js';
import type {
  DatasetExperiment,
  ExperimentDetails,
  Feedback,
  GetDatasetExperimentsInput,
  GetExperimentDetailsInput,
  GraphName,
  Run,
  RunEvaluationInput
} from '../types/index.js';
import { createEvaluator } from './evaluators.js';
import { GraphQLErrors } from '../graphql/errors.js';

// Map aliases
const create_rita_graph = rita;

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
   * Gets the list of available graph names
   * @returns GraphName[] - Array of available graph names
   */
  public getAvailableGraphs(): GraphName[] {
    return Object.keys(this.graphFactoryMap) as GraphName[];
  }

  public async runEvaluation(input: RunEvaluationInput, context: GraphQLContext) {
    const { graphName, datasetName, evaluators, experimentPrefix, inputKey, selectedCompanyId, preferredLanguage } = input;
    let selectedPreferredLanguage = preferredLanguage;

    // New needs:
    // User information: preferredLanguage
    // Context information: selectedCompanyId

    // selectedCompanyId should be provided always
    // preferredLanguage can be provided, if not provided, use the user's preferredLanguage

    // if the context.user is not provided, throw an error
    if (!context.user) {
      throw GraphQLErrors.UNAUTHENTICATED;
    }

    // if the context.user is provided, use the preferredLanguage from the context.user
    // if the preferredLanguage is not provided, use the preferredLanguage from the context.user

    if (!selectedPreferredLanguage) {
      selectedPreferredLanguage = context.user.me.preferredLanguage;
    }

    // Dynamically determine the question/input key if not provided
    let questionKey = inputKey;
    if (!questionKey) {
      const dataset: any = await this.client.readDataset({ datasetName });
      questionKey = dataset.inputs_schema_definition?.required?.[0];
      if (!questionKey) {
        throw new Error(
          `Could not dynamically determine the input key for dataset "${datasetName}". Please ensure it has input keys defined in LangSmith or provide an 'inputKey' in the request.`,
        );
      }
    }

    // Use the class property for graph factory map
    const graphFactory = this.graphFactoryMap[graphName];
    if (!graphFactory) {
      throw new Error(`Graph factory not found for graph: ${graphName}`);
    }
    // Target function for evaluation
    const target = async (inputs: Record<string, any>) => {
      const graphInput = {
        messages: [{ role: 'user', content: inputs[questionKey!] }],
      };
      const graph = await graphFactory();

      // Extract bearer token (if provided)
      let token = context.token || '';
      if (token.toLowerCase().startsWith('bearer ')) {
        token = token.slice(7).trim();
      }

      console.dir(token, { depth: null });

// Config needs user information
// identity: string;
// role: string;
// token: string;
// permissions: string[];
// user: {
//   id: string;
//   role: string;
//   firstName: string;
//   lastName: string;
//   preferredLanguage: "EN" | "DE";
//   company: {
//     id: string;
//     name: string;
//   };
// };

      const config = {
        configurable: {
          thread_id: `eval-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          langgraph_auth_user: {
            token,
            user: {
              firstName: context.user.me.firstName,
              lastName: context.user.me.lastName,
              preferredLanguage: context.user.me.preferredLanguage,
              company: {
                id: selectedCompanyId,
              },
            }
          },
        },
      };

      console.dir(graphInput, { depth: null });

      const result: any = await graph.invoke(graphInput, config);

      const lastMessage = Array.isArray(result?.messages)
        ? result.messages[result.messages.length - 1]
        : undefined;
      const answer = lastMessage?.content;

      if (typeof answer !== 'string') {
        console.warn(
          'Graph did not return a final message with string content. Returning empty answer. Full result:',
          JSON.stringify(result, null, 2),
        );
        return { answer: '' };
      }
      return { answer };
    };

    // Prepare evaluators
    const evaluationConfig = {
      evaluators: evaluators.map((evaluatorInput) =>
        createEvaluator(
          evaluatorInput.type,
          evaluatorInput.customPrompt,
          evaluatorInput.model,
          evaluatorInput.referenceKey,
        ),
      ),
      experimentPrefix: experimentPrefix || `eval-${graphName}`,
    };

    // Execute evaluation
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

    // Build LangSmith experiment URL
    const manager = experimentResults?.manager;
    const client = manager?.client;
    const experiment = manager?._experiment;
    const experimentName = experiment?.name ?? 'Unnamed Experiment';

    const webUrl = client?.webUrl;
    const tenantId = client?._tenantId;
    const datasetId = experiment?.reference_dataset_id;
    const experimentId = experiment?.id;

    let url = '';
    if (webUrl && tenantId && datasetId && experimentId) {
      url = `${webUrl}/o/${tenantId}/datasets/${datasetId}/compare?selectedSessions=${experimentId}`;
    }
    if (!url) {
      console.warn('Could not construct the full LangSmith results URL from the experiment object. Providing a fallback.');
      url = webUrl ? `${webUrl}/projects` : 'URL not available';
    }

    return {
      url,
      experimentName,
      results,
    };
  }

  public async getDatasetExperiments(input: GetDatasetExperimentsInput): Promise<{
    experiments: DatasetExperiment[];
    total: number;
  }> {
    const { datasetId, offset = 0, limit = 10, sortBy = 'start_time', sortByDesc = true } = input;

    console.log('🔍 [DEBUG] Starting getDatasetExperiments');
    console.log('🔍 [DEBUG] Input parameters:', JSON.stringify(input, null, 2));
    console.log('🔍 [DEBUG] Environment variables:');
    console.log('   LANGSMITH_ENDPOINT:', process.env.LANGSMITH_ENDPOINT);
    console.log('   LANGSMITH_API_KEY present:', !!process.env.LANGSMITH_API_KEY);

    // Build the URL with query parameters
    // Use environment variable for API URL, defaulting to US region
    let baseUrl = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
    
    console.log('🔍 [DEBUG] Initial baseUrl:', baseUrl);
    
    // Handle EU region URL format - ensure we use the correct base URL
    if (baseUrl.includes('eu.api.smith.langchain.com')) {
      baseUrl = 'https://eu.api.smith.langchain.com';
    }
    
    console.log('🔍 [DEBUG] After EU check baseUrl:', baseUrl);
    
    // Remove /api/v1 suffix if present since we'll add it
    baseUrl = baseUrl.replace(/\/api\/v1\/?$/, '');
    
    console.log('🔍 [DEBUG] After cleanup baseUrl:', baseUrl);
    
    // Use the documented /api/v1/sessions endpoint
    const url = new URL('/api/v1/sessions', baseUrl);
    url.searchParams.set('reference_dataset', datasetId);
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('sort_by', sortBy);
    url.searchParams.set('sort_by_desc', sortByDesc.toString());
    url.searchParams.set('use_approx_stats', 'false');

    // Get API key from environment variable
    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      throw new Error('LANGSMITH_API_KEY environment variable is required');
    }

    console.log('🔍 [DEBUG] Final request details:');
    console.log('   URL:', url.toString());
    console.log('   API Key present:', !!apiKey);
    console.log('   API Key length:', apiKey.length);
    console.log('   API Key prefix:', apiKey.substring(0, 8) + '...');
    console.log('   Dataset ID:', datasetId);

    const headers = {
      'x-api-key': apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    console.log('🔍 [DEBUG] Request headers:', headers);

    try {
      console.log('🔍 [DEBUG] Making fetch request...');
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      });

      console.log('📡 [DEBUG] Response received:');
      console.log('   Status:', response.status);
      console.log('   Status Text:', response.statusText);
      console.log('   OK:', response.ok);
      console.log('   Headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [DEBUG] Response error details:');
        console.error('   Status:', response.status);
        console.error('   Status Text:', response.statusText);
        console.error('   Error body:', errorText);
        
        // Try to parse as JSON for more details
        try {
          const errorJson = JSON.parse(errorText);
          console.error('   Parsed error:', JSON.stringify(errorJson, null, 2));
        } catch {
          console.error('   Raw error text:', errorText);
        }
        
        throw new Error(`Failed to fetch experiments: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Check if response is streaming (Server-Sent Events)
      const contentType = response.headers.get('content-type');
      console.log('📄 [DEBUG] Content-Type:', contentType);
      
      if (contentType?.includes('text/event-stream')) {
        console.log('🌊 [DEBUG] Processing as streaming response');
        return await this.parseStreamingResponse(response);
      } else {
        console.log('📋 [DEBUG] Processing as JSON response');
        // Handle regular JSON response
        const responseText = await response.text();
        console.log('📄 [DEBUG] Raw response text:', responseText.substring(0, 500) + '...');
        
        try {
          const data = JSON.parse(responseText);
          console.log('📄 [DEBUG] Parsed response data:', JSON.stringify(data, null, 2));
          
          // Extract total from pagination header
          const totalFromHeader = response.headers.get('x-pagination-total');
          const total = totalFromHeader ? parseInt(totalFromHeader, 10) : 0;
          console.log('📊 [DEBUG] Total from header:', total);
          
          return this.transformSessionsResponse(data, total);
        } catch (parseError) {
          console.error('❌ [DEBUG] Failed to parse JSON response:', parseError);
          console.error('📄 [DEBUG] Full response text:', responseText);
          throw new Error(`Failed to parse response as JSON: ${parseError}`);
        }
      }
    } catch (error) {
      console.error('💥 [DEBUG] Error in getDatasetExperiments:', error);
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error('🌐 [DEBUG] Network error - check if the endpoint is reachable');
        console.error('🌐 [DEBUG] Trying to reach:', url.toString());
      }
      
      throw new Error(`Failed to fetch experiments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async parseStreamingResponse(response: Response): Promise<{
    experiments: DatasetExperiment[];
    total: number;
  }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Unable to read streaming response');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let experiments: DatasetExperiment[] = [];
    let total = 0;
    let eventCount = 0;

    console.log('🌊 Starting to parse streaming response...');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('✅ Streaming response complete');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            eventCount++;
            try {
              const jsonData = line.slice(6); // Remove 'data: ' prefix
              console.log(`📦 Event ${eventCount}:`, jsonData);
              
              const parsedData = JSON.parse(jsonData);
              
              if (parsedData.patch && Array.isArray(parsedData.patch)) {
                console.log(`🔧 Processing ${parsedData.patch.length} patches`);
                
                for (const patch of parsedData.patch) {
                  console.log('🔧 Patch:', JSON.stringify(patch, null, 2));
                  
                  if (patch.op === 'add' && patch.path === '' && patch.value?.rows) {
                    // Initial data with experiments
                    console.log(`📊 Found ${patch.value.rows.length} initial experiments`);
                    experiments = this.transformRows(patch.value.rows);
                    total = patch.value.total || 0;
                    console.log(`📈 Total experiments: ${total}`);
                  } else if (patch.op === 'add' && patch.path.startsWith('/rows/')) {
                    // Updates to existing experiments
                    console.log('🔄 Applying row update:', patch.path);
                    this.applyRowUpdate(experiments, patch);
                  }
                }
              }
            } catch (parseError) {
              console.warn('⚠️ Failed to parse SSE data:', parseError);
              console.warn('📄 Raw data:', line);
            }
          } else if (line.startsWith('event: ')) {
            console.log('🎯 Event type:', line.slice(7));
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log(`🎉 Streaming parsing complete: ${experiments.length} experiments, total: ${total}`);
    return { experiments, total };
  }

  private transformSessionsResponse(data: any, total: number): {
    experiments: DatasetExperiment[];
    total: number;
  } {
    console.log('🔄 [DEBUG] Transforming sessions response');
    console.log('🔄 [DEBUG] Data type:', Array.isArray(data) ? 'array' : typeof data);
    console.log('🔄 [DEBUG] Data length/keys:', Array.isArray(data) ? data.length : Object.keys(data || {}));
    
    // Handle direct array response (current API format)
    if (Array.isArray(data)) {
      console.log('🔄 [DEBUG] Processing direct array of experiments');
      return {
        experiments: this.transformRows(data),
        total,
      };
    }
    
    // Handle object with rows property (alternative format)
    if (data && data.rows && Array.isArray(data.rows)) {
      console.log('🔄 [DEBUG] Processing rows object format');
      return {
        experiments: this.transformRows(data.rows),
        total,
      };
    }
    
    console.log('⚠️ [DEBUG] Unknown response format, returning empty');
    return { experiments: [], total: 0 };
  }

  private transformRows(rows: any[]): DatasetExperiment[] {
    console.log('🔄 [DEBUG] Transforming', rows.length, 'experiments');
    
    return rows.map((row, index) => {
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
        feedbackStats: row.feedback_stats ? this.parseFeedbackStats(row.feedback_stats) : undefined,
        testRunNumber: row.test_run_number ?? undefined,
        metadata: row.extra?.metadata ?? undefined,
      };
    });
  }

  private parseFeedbackStats(feedbackStatsRaw: any): any {
    try {
      if (typeof feedbackStatsRaw === 'string') {
        const parsed = JSON.parse(feedbackStatsRaw);
        // Transform the parsed object to match GraphQL schema expectations
        const transformed: any = {};
        
        for (const [key, value] of Object.entries(parsed)) {
          if (value && typeof value === 'object') {
            const valueObj = value as any;
            transformed[key] = {
              ...valueObj,
              // Stringify the values field to match GraphQL String type
              values: valueObj.values ? JSON.stringify(valueObj.values) : undefined,
            };
          }
        }
        
        return transformed;
      }
      // If it's already an object, transform it the same way
      if (typeof feedbackStatsRaw === 'object' && feedbackStatsRaw !== null) {
        const transformed: any = {};
        
        for (const [key, value] of Object.entries(feedbackStatsRaw)) {
          if (value && typeof value === 'object') {
            const valueObj = value as any;
            transformed[key] = {
              ...valueObj,
              // Stringify the values field to match GraphQL String type
              values: valueObj.values ? JSON.stringify(valueObj.values) : undefined,
            };
          }
        }
        
        return transformed;
      }
      
      return feedbackStatsRaw;
    } catch (error) {
      console.error('❌ [DEBUG] Failed to parse feedback stats:', error);
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
        case 'run_count':
          experiment.runCount = patch.value;
          break;
        case 'total_tokens':
          experiment.totalTokens = patch.value;
          break;
        case 'prompt_tokens':
          experiment.promptTokens = patch.value;
          break;
        case 'completion_tokens':
          experiment.completionTokens = patch.value;
          break;
        case 'total_cost':
          experiment.totalCost = patch.value;
          break;
        case 'prompt_cost':
          experiment.promptCost = patch.value;
          break;
        case 'completion_cost':
          experiment.completionCost = patch.value;
          break;
        case 'error_rate':
          experiment.errorRate = patch.value;
          break;
        case 'latency_p50':
          experiment.latencyP50 = patch.value;
          break;
        case 'latency_p99':
          experiment.latencyP99 = patch.value;
          break;
        case 'feedback_stats':
          experiment.feedbackStats = patch.value;
          break;
        case 'last_run_start_time':
          // This could be used to update some timestamp if needed
          break;
        default:
          // Handle any other fields if needed
          break;
      }
    }
  }

  public async getExperimentDetails(input: GetExperimentDetailsInput): Promise<ExperimentDetails> {
    const { experimentId, offset = 0, limit = 50 } = input;

    console.log('🔍 [DEBUG] Getting experiment details for:', experimentId);

    // Build the API URL
    let baseUrl = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
    if (baseUrl.includes('eu.api.smith.langchain.com')) {
      baseUrl = 'https://eu.api.smith.langchain.com';
    }
    baseUrl = baseUrl.replace(/\/api\/v1\/?$/, '');

    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      throw new Error('LANGSMITH_API_KEY environment variable is required');
    }

    try {
      // 1. Get the experiment/session details
      const sessionUrl = `${baseUrl}/api/v1/sessions/${experimentId}`;
      console.log('📡 [DEBUG] Fetching experiment details from:', sessionUrl);

      const sessionResponse = await fetch(sessionUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!sessionResponse.ok) {
        throw new Error(`Failed to fetch experiment details: ${sessionResponse.status} ${sessionResponse.statusText}`);
      }

      const sessionData = await sessionResponse.json();
      console.log('✅ [DEBUG] Got experiment details');

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
        feedbackStats: sessionData.feedback_stats ? this.parseFeedbackStats(sessionData.feedback_stats) : undefined,
        testRunNumber: sessionData.test_run_number ?? undefined,
        metadata: sessionData.extra?.metadata ?? undefined,
      };

      // 2. Get the runs for this experiment using the correct endpoint
      // Extract dataset ID from session data to use the proper endpoint
      const datasetId = sessionData.reference_dataset_id || sessionData.reference_dataset;
      
      if (!datasetId) {
        throw new Error('Dataset ID not found in experiment/session data');
      }

      const runsUrl = `${baseUrl}/api/v1/datasets/${datasetId}/runs`;
      console.log('📡 [DEBUG] Fetching runs from:', runsUrl);
      console.log('📡 [DEBUG] Using dataset ID:', datasetId);

      const requestPayload = {
        session_ids: [experimentId],
        offset: offset,
        limit: limit,
        preview: true,
        filters: {}
      };

      console.log('📤 [DEBUG] Request payload:', JSON.stringify(requestPayload, null, 2));

      const runsResponse = await fetch(runsUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      if (!runsResponse.ok) {
        const errorText = await runsResponse.text();
        console.error('❌ [DEBUG] Runs API error:', runsResponse.status, runsResponse.statusText, errorText);
        throw new Error(`Failed to fetch runs: ${runsResponse.status} ${runsResponse.statusText}`);
      }

      const runsData = await runsResponse.json();
      console.log(`✅ [DEBUG] Got runs response:`, JSON.stringify(runsData, null, 2));

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

      console.log(`✅ [DEBUG] Processed ${allRuns.length} runs`);

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
          name: run.name || '',
          runType: run.run_type || '',
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
          feedbackStats: run.feedback_stats ? this.parseFeedbackStats(run.feedback_stats) : undefined,
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
      console.error('❌ [DEBUG] Error getting experiment details:', error);
      throw error;
    }
  }

  public async getFeedbackForRun(runId: string): Promise<Feedback[]> {
    console.log('🔍 [DEBUG] Getting feedback for run:', runId);

    // Build the API URL
    let baseUrl = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
    if (baseUrl.includes('eu.api.smith.langchain.com')) {
      baseUrl = 'https://eu.api.smith.langchain.com';
    }
    baseUrl = baseUrl.replace(/\/api\/v1\/?$/, '');

    const apiKey = process.env.LANGSMITH_API_KEY;
    if (!apiKey) {
      throw new Error('LANGSMITH_API_KEY environment variable is required');
    }

    try {
      const feedbackUrl = `${baseUrl}/feedback?run=${runId}`;
      console.log('📡 [DEBUG] Fetching feedback from:', feedbackUrl);

      const response = await fetch(feedbackUrl, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [DEBUG] Feedback API error:', response.status, response.statusText, errorText);
        throw new Error(`Failed to fetch feedback: ${response.status} ${response.statusText}`);
      }

      const feedbackData = await response.json();
      console.log(`✅ [DEBUG] Got ${feedbackData.length || 0} feedback entries`);

      // Transform the feedback data to match our interface
      const feedback: Feedback[] = (feedbackData || []).map((item: any): Feedback => ({
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
      }));

      return feedback;
    } catch (error) {
      console.error('❌ [DEBUG] Error getting feedback for run:', error);
      throw error;
    }
  }
} 