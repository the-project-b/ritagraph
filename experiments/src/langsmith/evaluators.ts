import { CORRECTNESS_PROMPT, createLLMAsJudge } from 'openevals';

export type EvaluatorType = 'CORRECTNESS';

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