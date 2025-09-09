import { Result } from "../../shared/types/result.js";
import { ValidationError } from "../../shared/errors/domain.errors.js";

/**
 * Represents metadata for a prompt.
 */
export interface PromptMetadataData {
  version: string;
  tags: string[];
  owner?: string;
  description?: string;
  category: PromptCategory;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Enum for prompt categories.
 */
export enum PromptCategory {
  ROUTING = "ROUTING",
  COMMUNICATION = "COMMUNICATION",
  WORKFLOW = "WORKFLOW",
  SYSTEM = "SYSTEM",
  UTILITY = "UTILITY",
}

/**
 * Immutable value object representing prompt metadata.
 * Contains version, tags, and other tracking information.
 */
export class PromptMetadata {
  private constructor(private readonly data: PromptMetadataData) {}

  // #region Factory Methods
  /**
   * Creates PromptMetadata with validation.
   * @param data - The metadata to validate and create
   * @returns Result<PromptMetadata, ValidationError> - Success with metadata or validation error
   */
  static create(
    data: Partial<PromptMetadataData>,
  ): Result<PromptMetadata, ValidationError> {
    const now = new Date();
    const metadata: PromptMetadataData = {
      version: data.version || "latest",
      tags: data.tags || [],
      owner: data.owner,
      description: data.description,
      category: data.category || PromptCategory.UTILITY,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };

    const validationResult = this.validate(metadata);
    if (Result.isFailure(validationResult)) {
      return validationResult as Result<never, ValidationError>;
    }

    return Result.success(new PromptMetadata(metadata));
  }

  /**
   * Validates metadata fields.
   * @param data - The metadata to validate
   * @returns Result<void, ValidationError> - Success or validation error
   */
  private static validate(
    data: PromptMetadataData,
  ): Result<void, ValidationError> {
    if (!data.version || data.version.trim() === "") {
      return Result.failure(
        new ValidationError("Version must be a non-empty string", "version"),
      );
    }

    if (!Array.isArray(data.tags)) {
      return Result.failure(
        new ValidationError("Tags must be an array", "tags"),
      );
    }

    if (!Object.values(PromptCategory).includes(data.category)) {
      return Result.failure(
        new ValidationError(`Invalid category: ${data.category}`, "category"),
      );
    }

    return Result.success(void 0);
  }
  // #endregion

  // #region Getters
  /**
   * Gets the version.
   * @returns string - The version string
   */
  getVersion(): string {
    return this.data.version;
  }

  /**
   * Gets the tags.
   * @returns string[] - Copy of tags array
   */
  getTags(): string[] {
    return [...this.data.tags];
  }

  /**
   * Gets the owner.
   * @returns string | undefined - The owner or undefined
   */
  getOwner(): string | undefined {
    return this.data.owner;
  }

  /**
   * Gets the description.
   * @returns string | undefined - The description or undefined
   */
  getDescription(): string | undefined {
    return this.data.description;
  }

  /**
   * Gets the category.
   * @returns PromptCategory - The prompt category
   */
  getCategory(): PromptCategory {
    return this.data.category;
  }

  /**
   * Gets the creation date.
   * @returns Date - The creation date
   */
  getCreatedAt(): Date {
    return this.data.createdAt;
  }

  /**
   * Gets the last update date.
   * @returns Date - The update date
   */
  getUpdatedAt(): Date {
    return this.data.updatedAt;
  }
  // #endregion

  // #region Modifications
  /**
   * Creates a new metadata with updated version.
   * @param version - The new version
   * @returns Result<PromptMetadata, ValidationError> - New metadata or error
   */
  withVersion(version: string): Result<PromptMetadata, ValidationError> {
    return PromptMetadata.create({
      ...this.data,
      version,
      updatedAt: new Date(),
    });
  }

  /**
   * Creates a new metadata with additional tags.
   * @param tags - Tags to add
   * @returns Result<PromptMetadata, ValidationError> - New metadata with added tags or error
   */
  withTags(...tags: string[]): Result<PromptMetadata, ValidationError> {
    return PromptMetadata.create({
      ...this.data,
      tags: [...new Set([...this.data.tags, ...tags])],
      updatedAt: new Date(),
    });
  }
  // #endregion
}
