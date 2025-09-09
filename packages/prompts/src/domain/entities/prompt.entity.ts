import { Result } from "../../shared/types/result.js";
import {
  ValidationError,
  FormatError,
  PromptCreationError,
  LanguageNotSupportedError,
} from "../../shared/errors/domain.errors.js";
import { PromptId } from "../value-objects/prompt-id.value-object.js";
import { PromptTemplate } from "../value-objects/prompt-template.value-object.js";
import { LanguageCode } from "../value-objects/language-code.value-object.js";
import { PromptVariables } from "../value-objects/prompt-variables.value-object.js";
import {
  PromptMetadata,
  PromptCategory,
} from "../value-objects/prompt-metadata.value-object.js";

/**
 * Parameters for creating a new Prompt entity.
 */
export interface CreatePromptParams {
  id: string;
  name: string;
  category?: PromptCategory;
  templates: Map<string, string> | { [key: string]: string };
  variables?: PromptVariables;
  metadata?: Partial<{
    version: string;
    tags: string[];
    owner: string;
    description: string;
  }>;
}

/**
 * Represents a formatted prompt with metadata for LangSmith tracking.
 */
export interface FormattedPrompt {
  content: string;
  metadata: {
    promptId: string;
    promptName: string;
    version: string;
    languageUsed: string;
    variablesProvided: Record<string, unknown>;
    templateUsed: string;
    tags: string[];
    timestamp: Date;
    truncations?: Array<{
      field: string;
      originalLength: number;
      truncatedTo: number;
    }>;
  };
}

/**
 * Domain entity representing a prompt with multi-language support.
 * Core aggregate for prompt management with formatting capabilities.
 */
export class Prompt {
  private constructor(
    private readonly id: PromptId,
    private readonly name: string,
    private readonly templates: Map<LanguageCode, PromptTemplate>,
    private readonly variables: PromptVariables,
    private metadata: PromptMetadata,
    private createdAt: Date,
    private updatedAt: Date,
  ) {}

  // #region Factory Methods
  /**
   * Creates a new Prompt entity with validation.
   * @param params - Parameters for prompt creation
   * @returns Result<Prompt, PromptCreationError> - Success with Prompt or creation error
   */
  static create(
    params: CreatePromptParams,
  ): Result<Prompt, PromptCreationError> {
    const violations: string[] = [];

    const idResult = PromptId.create(params.id);
    if (Result.isFailure(idResult)) {
      violations.push(`Invalid ID: ${Result.unwrapFailure(idResult).message}`);
    }

    if (!params.name || params.name.trim().length === 0) {
      violations.push("Name is required");
    }

    const templatesMap = new Map<LanguageCode, PromptTemplate>();
    const templateInput =
      params.templates instanceof Map
        ? params.templates
        : new Map(Object.entries(params.templates));

    for (const [lang, template] of templateInput) {
      const langResult = LanguageCode.fromString(lang);
      if (Result.isFailure(langResult)) {
        violations.push(`Invalid language: ${lang}`);
        continue;
      }

      const templateResult = PromptTemplate.create(template);
      if (Result.isFailure(templateResult)) {
        violations.push(
          `Invalid template for ${lang}: ${Result.unwrapFailure(templateResult).message}`,
        );
        continue;
      }

      templatesMap.set(
        Result.unwrap(langResult),
        Result.unwrap(templateResult),
      );
    }

    if (templatesMap.size === 0) {
      violations.push("At least one template is required");
    }

    const metadataResult = PromptMetadata.create({
      ...params.metadata,
      category: params.category || PromptCategory.UTILITY,
    });
    if (Result.isFailure(metadataResult)) {
      violations.push(
        `Invalid metadata: ${Result.unwrapFailure(metadataResult).message}`,
      );
    }

    if (violations.length > 0) {
      return Result.failure(
        new PromptCreationError("Failed to create prompt", violations),
      );
    }

    const now = new Date();

    if (Result.isFailure(idResult) || Result.isFailure(metadataResult)) {
      return Result.failure(
        new PromptCreationError(
          "Failed to create prompt due to validation errors",
          violations,
        ),
      );
    }

    return Result.success(
      new Prompt(
        Result.unwrap(idResult),
        params.name.trim(),
        templatesMap,
        params.variables || PromptVariables.empty(),
        Result.unwrap(metadataResult),
        now,
        now,
      ),
    );
  }
  // #endregion

  // #region Language Management
  /**
   * Adds or updates a language variant.
   * @param language - The language code
   * @param template - The template string
   * @returns Result<void, ValidationError> - Success or validation error
   */
  addLanguageVariant(
    language: LanguageCode,
    template: string,
  ): Result<void, ValidationError> {
    const templateResult = PromptTemplate.create(template);
    if (Result.isFailure(templateResult)) {
      return templateResult as Result<never, ValidationError>;
    }

    this.templates.set(language, Result.unwrap(templateResult));
    this.updatedAt = new Date();
    return Result.success(void 0);
  }

  /**
   * Gets a template for a specific language with fallback.
   * @param language - The requested language
   * @returns Result<PromptTemplate, LanguageNotSupportedError> - Template or error
   */
  private getTemplateForLanguage(
    language: LanguageCode,
  ): Result<PromptTemplate, LanguageNotSupportedError> {
    let template = this.templates.get(language);

    if (!template && !language.isDefault()) {
      template = this.templates.get(LanguageCode.getDefault());
    }

    if (!template) {
      const available = Array.from(this.templates.keys()).map((l) =>
        l.toString(),
      );
      return Result.failure(
        new LanguageNotSupportedError(language.toString(), available),
      );
    }

    return Result.success(template);
  }
  // #endregion

  // #region Formatting
  /**
   * Formats the prompt with variables and metadata.
   * @param variables - Variables for template substitution
   * @param language - Target language (defaults to EN)
   * @returns Result<FormattedPrompt, FormatError> - Formatted prompt with metadata or error
   */
  format(
    variables: Record<string, unknown> = {},
    language: LanguageCode = LanguageCode.getDefault(),
  ): Result<FormattedPrompt, FormatError> {
    const templateResult = this.getTemplateForLanguage(language);
    if (Result.isFailure(templateResult)) {
      const error = Result.unwrapFailure(templateResult);
      return Result.failure(new FormatError(error.message));
    }

    const template = Result.unwrap(templateResult);

    const validatedVariablesResult = this.variables.validate(variables);
    if (Result.isFailure(validatedVariablesResult)) {
      const error = Result.unwrapFailure(validatedVariablesResult);
      return Result.failure(new FormatError(error.message));
    }

    const validatedVariables = Result.unwrap(validatedVariablesResult);
    const formatResult = template.format(validatedVariables);

    if (Result.isFailure(formatResult)) {
      return formatResult as Result<never, FormatError>;
    }

    const formatted = Result.unwrap(formatResult);

    const formattedPrompt: FormattedPrompt = {
      content: formatted.content,
      metadata: {
        promptId: this.id.toString(),
        promptName: this.name,
        version: this.metadata.getVersion(),
        languageUsed: language.toString(),
        variablesProvided: validatedVariables,
        templateUsed: template.getTemplate(),
        tags: this.metadata.getTags(),
        timestamp: new Date(),
      },
    };

    return Result.success(formattedPrompt);
  }

  /**
   * Formats the prompt with content truncation.
   * @param variables - Variables for template substitution
   * @param language - Target language
   * @param maxLength - Maximum content length
   * @returns Result<FormattedPrompt, FormatError> - Formatted prompt with truncation metadata
   */
  formatWithTruncation(
    variables: Record<string, unknown> = {},
    language: LanguageCode = LanguageCode.getDefault(),
    maxLength: number = 2500,
  ): Result<FormattedPrompt, FormatError> {
    const result = this.format(variables, language);
    if (Result.isFailure(result)) {
      return result;
    }

    const formatted = Result.unwrap(result);
    const truncations: FormattedPrompt["metadata"]["truncations"] = [];

    if (formatted.content.length > maxLength) {
      truncations.push({
        field: "content",
        originalLength: formatted.content.length,
        truncatedTo: maxLength,
      });
      formatted.content = formatted.content.slice(0, maxLength);
    }

    if (truncations.length > 0) {
      formatted.metadata.truncations = truncations;
    }

    return Result.success(formatted);
  }
  // #endregion

  // #region Getters
  /**
   * Gets the prompt ID.
   * @returns PromptId - The prompt identifier
   */
  getId(): PromptId {
    return this.id;
  }

  /**
   * Gets the prompt name.
   * @returns string - The prompt name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Gets the prompt metadata.
   * @returns PromptMetadata - The metadata
   */
  getMetadata(): PromptMetadata {
    return this.metadata;
  }

  /**
   * Gets available language codes.
   * @returns LanguageCode[] - Array of supported languages
   */
  getAvailableLanguages(): LanguageCode[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Checks if a language is supported.
   * @param language - The language to check
   * @returns boolean - True if language is supported
   */
  hasLanguage(language: LanguageCode): boolean {
    return this.templates.has(language);
  }

  /**
   * Gets the creation date.
   * @returns Date - Creation timestamp
   */
  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * Gets the last update date.
   * @returns Date - Update timestamp
   */
  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  /**
   * Gets the raw template for a specific language.
   * @param language - The language code
   * @returns Result<PromptTemplate, LanguageNotSupportedError> - The template or error
   */
  getTemplate(
    language: LanguageCode,
  ): Result<PromptTemplate, LanguageNotSupportedError> {
    return this.getTemplateForLanguage(language);
  }

  /**
   * Gets the prompt variables.
   * @returns PromptVariables - The variables definition
   */
  getVariables(): PromptVariables {
    return this.variables;
  }
  // #endregion

  // #region Updates
  /**
   * Updates the prompt metadata.
   * @param metadata - Partial metadata to update
   * @returns Result<void, ValidationError> - Success or validation error
   */
  updateMetadata(
    metadata: Partial<{
      version: string;
      tags: string[];
      owner: string;
      description: string;
    }>,
  ): Result<void, ValidationError> {
    const newMetadataResult = PromptMetadata.create({
      version: metadata.version || this.metadata.getVersion(),
      tags: metadata.tags || this.metadata.getTags(),
      owner: metadata.owner || this.metadata.getOwner(),
      description: metadata.description || this.metadata.getDescription(),
      category: this.metadata.getCategory(),
      createdAt: this.metadata.getCreatedAt(),
      updatedAt: new Date(),
    });

    if (Result.isFailure(newMetadataResult)) {
      return newMetadataResult as Result<never, ValidationError>;
    }

    this.metadata = Result.unwrap(newMetadataResult);
    this.updatedAt = new Date();
    return Result.success(void 0);
  }
  // #endregion
}
