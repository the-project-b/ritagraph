import { Result } from "../../shared/types/result.js";
import { Prompt } from "../../domain/entities/prompt.entity.js";
import { PromptVariables } from "../../domain/value-objects/prompt-variables.value-object.js";
import { LanguageCode } from "../../domain/value-objects/language-code.value-object.js";
import { Logger } from "@the-project-b/logging";

/**
 * Interface that mimics LangChain's PromptTemplate.
 */
export interface LangChainCompatiblePrompt {
  format: (values: Record<string, unknown>) => Promise<string>;
  formatPrompt?: (
    values: Record<string, unknown>,
  ) => Promise<{ value: string }>;
  inputVariables?: string[];
  template?: string;
}

/**
 * Adapter to provide LangChain PromptTemplate compatibility.
 * Bridges between our domain-driven prompt system and LangChain's expectations.
 */
export class LangChainPromptAdapter {
  private readonly logger: Logger;
  private static tempPromptCounter = 0;

  constructor(
    private readonly tempPrompts: Map<string, Prompt> = new Map(),
    logger?: Logger,
  ) {
    this.logger = logger || new Logger({ service: "langchain-adapter" });
  }

  // #region Template Creation
  /**
   * Creates a LangChain-compatible prompt from a template string.
   * @param template - The template string with {variable} placeholders
   * @returns Promise<LangChainCompatiblePrompt> - LangChain-compatible prompt
   */
  async fromTemplate(template: string): Promise<LangChainCompatiblePrompt> {
    this.logger.debug("Creating LangChain-compatible prompt from template", {
      templateLength: template.length,
    });

    const variables = this.extractVariables(template);
    const tempPrompt = await this.createTemporaryPrompt(template, variables);

    return {
      format: async (values: Record<string, unknown>) => {
        // Format directly using the tempPrompt, not through use case
        const formatResult = tempPrompt.format(values);
        if (Result.isFailure(formatResult)) {
          const error = Result.unwrapFailure(formatResult);
          this.logger.error("Failed to format prompt", {
            promptName: tempPrompt.getName(),
            error: error.message,
          });
          throw error;
        }

        return Result.unwrap(formatResult).content;
      },
      formatPrompt: async (values: Record<string, unknown>) => {
        const formatResult = tempPrompt.format(values);
        if (Result.isFailure(formatResult)) {
          throw Result.unwrapFailure(formatResult);
        }
        return { value: Result.unwrap(formatResult).content };
      },
      inputVariables: variables,
      template,
    };
  }

  /**
   * Creates a prompt from an existing Prompt entity.
   * @param prompt - The domain Prompt entity
   * @returns LangChainCompatiblePrompt - LangChain-compatible prompt
   */
  fromPrompt(prompt: Prompt): LangChainCompatiblePrompt {
    const template = prompt.getAvailableLanguages()[0]
      ? this.getTemplateString(prompt, prompt.getAvailableLanguages()[0])
      : "";

    return {
      format: async (values: Record<string, unknown>) => {
        const result = prompt.format(values);
        if (Result.isFailure(result)) {
          throw Result.unwrapFailure(result);
        }
        return Result.unwrap(result).content;
      },
      formatPrompt: async (values: Record<string, unknown>) => {
        const result = prompt.format(values);
        if (Result.isFailure(result)) {
          throw Result.unwrapFailure(result);
        }
        return { value: Result.unwrap(result).content };
      },
      inputVariables: this.extractVariables(template),
      template,
    };
  }
  // #endregion

  // #region Migration Helpers
  /**
   * Migrates a LangChain template string to our Prompt entity.
   * @param template - The LangChain template string
   * @param name - Optional name for the prompt
   * @param metadata - Optional metadata for the prompt
   * @returns Result<Prompt, Error> - Created Prompt or error
   */
  static migrate(
    template: string,
    name?: string,
    metadata?: Partial<{
      version: string;
      tags: string[];
      owner: string;
      description: string;
    }>,
  ): Result<Prompt, Error> {
    const promptName = name || `migrated-prompt-${Date.now()}`;
    const promptId = `prompt-${promptName}`;

    const templates = new Map<string, string>();
    templates.set("EN", template);

    const createResult = Prompt.create({
      id: promptId,
      name: promptName,
      templates,
      metadata,
    });

    if (Result.isFailure(createResult)) {
      return Result.failure(Result.unwrapFailure(createResult));
    }

    return Result.success(Result.unwrap(createResult));
  }
  // #endregion

  // #region Helper Methods
  /**
   * Extracts variable names from a template string.
   * @param template - The template string
   * @returns string[] - Array of variable names
   */
  private extractVariables(template: string): string[] {
    const pattern = /\{(\w+)\}/g;
    const variables: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  /**
   * Creates a temporary Prompt entity for ad-hoc templates.
   * @param template - The template string
   * @param variables - Variable names found in template
   * @returns Promise<Prompt> - Created temporary prompt
   */
  private async createTemporaryPrompt(
    template: string,
    variables: string[],
  ): Promise<Prompt> {
    const tempName = `temp-prompt-${++LangChainPromptAdapter.tempPromptCounter}`;
    const tempId = `temp-${tempName}`;

    const variableDefs = variables.map((name) => ({
      name,
      type: "string" as const,
      required: false,
    }));

    const variablesResult = PromptVariables.create(variableDefs);
    const promptVariables = Result.isSuccess(variablesResult)
      ? Result.unwrap(variablesResult)
      : PromptVariables.empty();

    const templates = new Map<string, string>();
    templates.set("EN", template);

    const promptResult = Prompt.create({
      id: tempId,
      name: tempName,
      templates,
      variables: promptVariables,
    });

    if (Result.isFailure(promptResult)) {
      throw Result.unwrapFailure(promptResult);
    }

    const prompt = Result.unwrap(promptResult);

    // Store in our internal temp prompts map
    this.tempPrompts.set(tempName, prompt);

    return prompt;
  }

  /**
   * Gets template string from a Prompt for a specific language.
   * @param prompt - The Prompt entity
   * @param language - The language code
   * @returns string - Template string or empty string
   */
  private getTemplateString(prompt: Prompt, language: LanguageCode): string {
    const formatResult = prompt.format({}, language);
    if (Result.isFailure(formatResult)) {
      return "";
    }
    return Result.unwrap(formatResult).metadata.templateUsed;
  }
  // #endregion
}
