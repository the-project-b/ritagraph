import type { EvaluatorResult as OpenEvalsResult } from 'openevals';
import { 
  TypedEvaluator, 
  EvaluatorParams, 
  EvaluatorResult, 
  EvaluationOptions,
  TextEvaluationInputs,
  TextEvaluationOutputs
} from '../core/types.js';
import { EXPECTED_OUTPUT_PROMPT } from '../prompts/expected-output.prompt.js';

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
    
    // Build reference outputs with proper typing and validation
    let referenceOutputs = undefined;
    if (params.referenceOutputs) {
      const key = referenceKey || 'reference';
      const referenceValue = params.referenceOutputs[key];
      
      if (referenceValue === undefined) {
        console.warn(`[EXPECTED_OUTPUT] Reference key '${key}' not found in referenceOutputs. Available keys: ${Object.keys(params.referenceOutputs).join(', ')}`);
        // Try to find a reasonable fallback
        const availableKeys = Object.keys(params.referenceOutputs);
        const fallbackKey = availableKeys.find(k => k.includes('expected') || k.includes('reference')) || availableKeys[0];
        if (fallbackKey) {
          console.warn(`[EXPECTED_OUTPUT] Using fallback key '${fallbackKey}'`);
          referenceOutputs = {
            reference: params.referenceOutputs[fallbackKey],
          };
        }
      } else {
        referenceOutputs = {
          reference: referenceValue,
        };
      }
    }

    // Import and use the regular createLLMAsJudge
    const { createLLMAsJudge } = await import('openevals');
    
    // Create the LLM judge with industry-standard 0-1 scale scoring
    const evaluator = createLLMAsJudge({
      prompt: customPrompt || EXPECTED_OUTPUT_PROMPT,
      model: model || this.config.defaultModel,
      feedbackKey: 'expected_output',
      choices: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], // 0-1 scale in 0.1 increments
    });

    // Execute evaluation directly with params.inputs (expecting 'question' key)
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