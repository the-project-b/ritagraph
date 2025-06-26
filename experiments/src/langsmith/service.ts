import { Client } from 'langsmith';
import { evaluate } from 'langsmith/evaluation';
import {
  create_multi_agent_rita_graph,
  create_multi_agent_dynamic_rita_graph,
  rita,
} from '@the-project-b/rita-v2-graphs';

import { createEvaluator } from './evaluators.js';

// Map aliases
const create_multi_agent_rita_graph_static = create_multi_agent_rita_graph;
const create_multi_agent_rita_graph_dynamic = create_multi_agent_dynamic_rita_graph;
const create_rita_graph = rita;

// Graph names supported by this evaluator service
export type GraphName = 'multi_agent' | 'multi_agent_dynamic' | 'rita';

export interface EvaluatorInput {
  type: 'CORRECTNESS';
  customPrompt?: string;
  model?: string;
  referenceKey?: string;
}

export interface RunEvaluationInput {
  graphName: GraphName;
  datasetName: string;
  evaluators: EvaluatorInput[];
  experimentPrefix?: string;
  inputKey?: string;
}

export class LangSmithService {
  private client: Client;

  constructor() {
    this.client = new Client();
  }

  public async runEvaluation(input: RunEvaluationInput, context: { token?: string }) {
    const { graphName, datasetName, evaluators, experimentPrefix, inputKey } = input;

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

    // Map graph names to their factory functions
    const graphFactoryMap: Record<GraphName, () => Promise<any>> = {
      multi_agent: create_multi_agent_rita_graph_static,
      multi_agent_dynamic: create_multi_agent_rita_graph_dynamic,
      rita: create_rita_graph,
    };

    const graphFactory = graphFactoryMap[graphName];
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

      const config = {
        configurable: {
          thread_id: `eval-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          langgraph_auth_user: {
            token,
          },
        },
      };

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
} 