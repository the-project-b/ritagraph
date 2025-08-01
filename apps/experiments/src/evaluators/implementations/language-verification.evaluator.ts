import type { EvaluatorResult as OpenEvalsResult } from 'openevals';
import { 
  TypedEvaluator, 
  EvaluatorParams, 
  EvaluatorResult, 
  EvaluationOptions,
  TextEvaluationInputs,
  TextEvaluationOutputs
} from '../core/types.js';
import { LANGUAGE_VERIFICATION_PROMPT } from '../prompts/language-verification.prompt.js';

// Define the specific types for this evaluator
interface LanguageVerificationInputs extends TextEvaluationInputs {
  readonly question: string;
  readonly preferredLanguage?: string;
}

interface LanguageVerificationOutputs extends TextEvaluationOutputs {
  readonly answer: string;
  readonly preferredLanguage?: string; // The language context from the Rita graph execution
}

interface LanguageVerificationReferenceOutputs {
  [key: string]: string; // Allow any key to be used as reference
}

export const languageVerificationEvaluator: TypedEvaluator<
  'LANGUAGE_VERIFICATION',
  LanguageVerificationInputs,
  LanguageVerificationOutputs,
  LanguageVerificationReferenceOutputs
> = {
  config: {
    type: 'LANGUAGE_VERIFICATION',
    name: 'Language Verification',
    description: 'Verifies that the final response is written in the correct target language (EN/German vs DE/English)',
    defaultModel: 'openai:gpt-4o',
    supportsCustomPrompt: true,
    supportsReferenceKey: true,
  } as const,
  
  async evaluate(
    params: EvaluatorParams<LanguageVerificationInputs, LanguageVerificationOutputs, LanguageVerificationReferenceOutputs>,
    options: EvaluationOptions = {}
  ): Promise<EvaluatorResult> {
    const { customPrompt, model, referenceKey } = options;
    
    // Determine the expected language:
    // 1. First, check if a referenceKey is provided and if the dataset contains a language for that key
    let expectedLanguage: string | undefined;
    if (referenceKey && params.referenceOutputs && params.referenceOutputs[referenceKey]) {
      expectedLanguage = params.referenceOutputs[referenceKey];
    }
    
    // 2. If no expectedLanguage in output, check for preferredLanguage in the input
    if (!expectedLanguage && params.inputs.preferredLanguage) {
      expectedLanguage = params.inputs.preferredLanguage;
    }
    
    // 3. If no language found in dataset, use the user's preferred language from authentication
    // This will be available in params.outputs.preferredLanguage from the Rita graph execution
    if (!expectedLanguage && params.outputs.preferredLanguage) {
      expectedLanguage = params.outputs.preferredLanguage;
    }
    
    // 4. Default to EN if nothing else is available
    if (!expectedLanguage) {
      expectedLanguage = 'EN';
    }
    
    // Normalize the language code to ensure consistency (EN/DE)
    expectedLanguage = expectedLanguage.toUpperCase();
    if (expectedLanguage !== 'EN' && expectedLanguage !== 'DE') {
      // Handle variations like "English" or "German"
      if (expectedLanguage.toLowerCase().includes('english')) {
        expectedLanguage = 'EN';
      } else if (expectedLanguage.toLowerCase().includes('german') || expectedLanguage.toLowerCase().includes('deutsch')) {
        expectedLanguage = 'DE';
      }
    }
    
    // Build reference outputs with language information
    const referenceOutputs = {
      reference: `Target Language: ${expectedLanguage} (${expectedLanguage === 'EN' ? 'English' : 'German'})`,
    };

    // Import and use the regular createLLMAsJudge
    const { createLLMAsJudge } = await import('openevals');
    
    // Create the LLM judge 
    const evaluator = createLLMAsJudge({
      prompt: customPrompt || LANGUAGE_VERIFICATION_PROMPT,
      model: model || this.config.defaultModel,
      feedbackKey: 'language_verification',
    });
    
    // Add language context to the inputs for the prompt
    const enhancedInputs = {
      ...params.inputs,
      languageContext: `Expected Language: ${expectedLanguage} (${expectedLanguage === 'EN' ? 'English' : 'German'})`,
    };

    // Execute evaluation using same pattern as expected-output evaluator
    const evaluatorResult = await evaluator({
      inputs: enhancedInputs,
      outputs: {
        // Only include the answer in outputs for the evaluator, not the preferredLanguage
        answer: params.outputs.answer,
      },
      referenceOutputs,
    }) as OpenEvalsResult;

    // Ensure the score is binary (0 or 1) for language verification
    let binaryScore = 0;
    if (typeof evaluatorResult.score === 'number') {
      binaryScore = evaluatorResult.score >= 0.5 ? 1 : 0;
    } else if (typeof evaluatorResult.score === 'boolean') {
      binaryScore = evaluatorResult.score ? 1 : 0;
    }

    return {
      key: evaluatorResult.key,
      score: binaryScore,
      comment: evaluatorResult.comment,
      metadata: {
        ...evaluatorResult.metadata,
        expectedLanguage: expectedLanguage,
        expectedLanguageName: expectedLanguage === 'EN' ? 'English' : 'German',
        referenceKey: referenceKey,
        languageSource: referenceKey && params.referenceOutputs && params.referenceOutputs[referenceKey] 
          ? 'dataset_output' 
          : (params.inputs.preferredLanguage 
            ? 'dataset_input' 
            : (params.outputs.preferredLanguage ? 'user_authentication' : 'default')),
        originalScore: evaluatorResult.score,
      },
    };
  },
} as const;