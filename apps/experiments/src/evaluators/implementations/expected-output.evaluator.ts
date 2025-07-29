import { createLLMAsJudge } from 'openevals';
import type { EvaluatorResult as OpenEvalsResult } from 'openevals';
import { 
  TypedEvaluator, 
  EvaluatorParams, 
  EvaluatorResult, 
  EvaluationOptions,
  TextEvaluationInputs,
  TextEvaluationOutputs
} from '../core/types';
import { EXPECTED_OUTPUT_PROMPT } from '../prompts/expected-output.prompt';

// Define the specific types for this evaluator
interface ExpectedOutputInputs extends TextEvaluationInputs {
  readonly question: string;
}

interface ExpectedOutputOutputs extends TextEvaluationOutputs {
  readonly answer: string;
}

interface ExpectedOutputReferenceOutputs {
  readonly reference: string;
}

export const expectedOutputEvaluator: TypedEvaluator<
  'EXPECTED_OUTPUT',
  ExpectedOutputInputs,
  ExpectedOutputOutputs,
  ExpectedOutputReferenceOutputs
> = {
  config: {
    type: 'EXPECTED_OUTPUT',
    name: 'Expected Output',
    description: 'Evaluates if the agent output matches the expected output described in the dataset',
    defaultModel: 'openai:gpt-4o',
    supportsCustomPrompt: true,
    supportsReferenceKey: true,
  } as const,
  
  async evaluate(
    params: EvaluatorParams<ExpectedOutputInputs, ExpectedOutputOutputs, ExpectedOutputReferenceOutputs>,
    options: EvaluationOptions = {}
  ): Promise<EvaluatorResult> {
    const { customPrompt, model, referenceKey } = options;
    
    // Build reference outputs with proper typing
    const referenceOutputs = params.referenceOutputs
      ? {
          reference: params.referenceOutputs[referenceKey || 'reference' as keyof ExpectedOutputReferenceOutputs],
        }
      : undefined;

    // Create the LLM judge with typed parameters
    const evaluator = createLLMAsJudge({
      prompt: customPrompt || EXPECTED_OUTPUT_PROMPT,
      model: model || this.config.defaultModel,
      feedbackKey: 'expected_output',
    });

    // Execute evaluation
    const evaluatorResult = await evaluator({
      inputs: params.inputs,
      outputs: params.outputs,
      referenceOutputs,
    }) as OpenEvalsResult;

    return {
      key: evaluatorResult.key,
      score: evaluatorResult.score,
      comment: evaluatorResult.comment,
      metadata: evaluatorResult.metadata,
    };
  },
} as const;