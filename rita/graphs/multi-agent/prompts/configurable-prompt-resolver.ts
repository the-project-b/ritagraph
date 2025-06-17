import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ExtendedState } from "../../../states/states";
import { BasePromptConfig, DynamicPromptContext, PromptResult } from "./base-prompt-loader";
import { GenericPromptLoader } from "./generic-prompt-loader";
import { createCustomPromptConfig } from "./prompt-configs";

/**
 * Maps template keys to their default prompt IDs for fallback behavior
 */
const TEMPLATE_FALLBACK_MAPPING = {
  template_supervisor: "sup_main",
  template_initial_plan: "sup_main", 
  template_intent_matching: "sup_intent_matching",
  template_query_generation: "sup_query_generation",
  template_mutation_generation: "sup_query_generation",
  template_result_formatting: "sup_formatting_result",
  template_tasks: "sup_tasks"
} as const;

/**
 * Resolves the appropriate prompt ID for a given template key.
 * Uses configured template if available, falls back to default.
 */
export function resolvePromptId(
  templateKey: keyof typeof TEMPLATE_FALLBACK_MAPPING,
  config: LangGraphRunnableConfig<any>
): string {
  // Check if this template is configured in the assistant
  const configuredPromptId = config?.configurable?.[templateKey];
  
  if (configuredPromptId && typeof configuredPromptId === 'string') {
    console.log(`🔧 Using configured prompt for ${templateKey}: ${configuredPromptId}`);
    return configuredPromptId;
  }
  
  // Fall back to default prompt
  const fallbackPromptId = TEMPLATE_FALLBACK_MAPPING[templateKey];
  console.log(`🔧 Using fallback prompt for ${templateKey}: ${fallbackPromptId}`);
  return fallbackPromptId;
}

/**
 * Creates a prompt loading context for a specific template key.
 * This integrates with the existing prompt loading system.
 */
export function createTemplatePromptContext(
  templateKey: keyof typeof TEMPLATE_FALLBACK_MAPPING,
  state: ExtendedState,
  config: LangGraphRunnableConfig<any>,
  model: any,
  extractSystemPrompts: boolean = false
): DynamicPromptContext {
  const promptId = resolvePromptId(templateKey, config);
  
  const templateConfig: BasePromptConfig = {
    promptId,
    model,
    extractSystemPrompts
  };
  
  return {
    state,
    config: {
      ...config,
      configurable: {
        ...config.configurable,
        ...templateConfig
      }
    }
  };
}

/**
 * Loads a prompt for a specific template key using the configurable system.
 * This is the main function nodes should use to load their prompts.
 */
export async function loadTemplatePrompt(
  templateKey: keyof typeof TEMPLATE_FALLBACK_MAPPING,
  state: ExtendedState,
  config: LangGraphRunnableConfig<any>,
  model: any,
  extractSystemPrompts: boolean = false
): Promise<PromptResult> {
  console.log(`🔧 Loading template prompt for ${templateKey}`);
  
  try {
    // Create the prompt context with resolved prompt ID
    const promptContext = createTemplatePromptContext(
      templateKey,
      state, 
      config,
      model,
      extractSystemPrompts
    );
    
    // Use the existing generic prompt loader
    const promptConfig = createCustomPromptConfig(
      templateKey,
      `TEMPLATE_${templateKey.toUpperCase()}`
    );
    
    const loader = new GenericPromptLoader(promptConfig);
    const result = await loader.loadPrompt(promptContext);
    
    console.log(`🔧 Successfully loaded template prompt for ${templateKey}`);
    return result;
    
  } catch (error) {
    console.error(`🔧 Failed to load template prompt for ${templateKey}:`, error);
    throw new Error(`Failed to load template prompt for ${templateKey}: ${error.message}`);
  }
}

/**
 * Utility function to check if a template is configured for an assistant
 */
export function isTemplateConfigured(
  templateKey: keyof typeof TEMPLATE_FALLBACK_MAPPING,
  config: LangGraphRunnableConfig<any>
): boolean {
  const configuredPromptId = config?.configurable?.[templateKey];
  return !!(configuredPromptId && typeof configuredPromptId === 'string');
}

/**
 * Gets all configured template mappings from an assistant config
 */
export function getConfiguredTemplates(config: LangGraphRunnableConfig<any>): Record<string, string> {
  const configured: Record<string, string> = {};
  
  if (config?.configurable) {
    Object.keys(TEMPLATE_FALLBACK_MAPPING).forEach(templateKey => {
      const promptId = config.configurable[templateKey];
      if (promptId && typeof promptId === 'string') {
        configured[templateKey] = promptId;
      }
    });
  }
  
  return configured;
}

/**
 * Convenience function for nodes to load template prompts with real config
 * This automatically uses the node's config and state context
 */
export async function loadNodeTemplatePrompt(
  templateKey: keyof typeof TEMPLATE_FALLBACK_MAPPING,
  state: ExtendedState,
  config: LangGraphRunnableConfig<any>,
  model: any,
  additionalMemoryData?: Record<string, any>,
  extractSystemPrompts: boolean = false
): Promise<PromptResult> {
  console.log(`🔧 Loading node template prompt for ${templateKey}`);
  
  // Enhance state with additional memory data if provided
  let enhancedState = state;
  if (additionalMemoryData) {
    const enhancedMemory = new Map(state.memory || new Map());
    Object.entries(additionalMemoryData).forEach(([key, value]) => {
      enhancedMemory.set(key, value);
    });
    
    enhancedState = {
      ...state,
      memory: enhancedMemory
    };
  }
  
  return loadTemplatePrompt(
    templateKey,
    enhancedState,
    config,
    model,
    extractSystemPrompts
  );
} 