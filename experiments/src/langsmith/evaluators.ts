import { CORRECTNESS_PROMPT, createLLMAsJudge } from 'openevals';

export type EvaluatorType = 'CORRECTNESS';

// Export available evaluator types for dynamic querying
export const AVAILABLE_EVALUATORS: EvaluatorType[] = ['CORRECTNESS'];

// Export evaluator metadata for richer information
export interface EvaluatorInfo {
  type: EvaluatorType;
  name: string;
  description: string;
  defaultModel: string;
  supportsCustomPrompt: boolean;
  supportsReferenceKey: boolean;
}

export const EVALUATOR_INFO: Record<EvaluatorType, EvaluatorInfo> = {
  CORRECTNESS: {
    type: 'CORRECTNESS',
    name: 'Correctness',
    description: 'Measures if the output is factually correct based on a reference answer',
    defaultModel: 'openai:gpt-4o',
    supportsCustomPrompt: true,
    supportsReferenceKey: true,
  },
};

export function createEvaluator(
  type: EvaluatorType,
  customPrompt?: string,
  model?: string,
  referenceKey?: string,
) {
  switch (type) {
    case 'CORRECTNESS':
      return async (params: any) => {
        const referenceOutputs = params.referenceOutputs
          ? {
              reference: params.referenceOutputs[referenceKey || 'reference'],
            }
          : undefined;

        const evaluator = createLLMAsJudge({
          prompt: customPrompt || CORRECTNESS_PROMPT,
          model: model || 'openai:gpt-4o',
          feedbackKey: 'correctness',
        });

        const evaluatorResult = await evaluator({
          inputs: params.inputs,
          outputs: params.outputs,
          referenceOutputs,
        });

        return evaluatorResult;
      };
    default:
      throw new Error(`Unhandled evaluator type: ${type}`);
  }
} 