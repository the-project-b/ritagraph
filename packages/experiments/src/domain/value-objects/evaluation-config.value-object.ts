import { ValidationError, asPositiveNumber } from "@the-project-b/types";

/**
 * Configuration for evaluation execution
 */
export class EvaluationConfig {
  public readonly experimentPrefix?: string;
  public readonly maxConcurrency: number;
  public readonly numRepetitions: number;
  public readonly selectedCompanyId: string;
  public readonly preferredLanguage?: string;

  constructor(config: {
    experimentPrefix?: string;
    maxConcurrency?: number;
    numRepetitions?: number;
    selectedCompanyId: string;
    preferredLanguage?: string;
  }) {
    this.experimentPrefix = config.experimentPrefix;

    try {
      this.maxConcurrency = config.maxConcurrency
        ? asPositiveNumber(config.maxConcurrency)
        : 10;
      this.numRepetitions = config.numRepetitions
        ? asPositiveNumber(config.numRepetitions)
        : 1;
    } catch (error) {
      throw new ValidationError("Invalid evaluation configuration");
    }

    if (!config.selectedCompanyId) {
      throw new ValidationError("selectedCompanyId is required");
    }

    this.selectedCompanyId = config.selectedCompanyId;
    this.preferredLanguage = config.preferredLanguage;
  }

  validate(): void {
    if (this.maxConcurrency > 100) {
      throw new ValidationError("maxConcurrency cannot exceed 100");
    }
    if (this.numRepetitions > 10) {
      throw new ValidationError("numRepetitions cannot exceed 10");
    }
  }
}
