import { Result, ok, err, isErr, ValidationError } from "@the-project-b/types";

export type ExtractionDetailLevel = "hybrid" | "full" | "text-only";
export type TextractFeature = "FORMS" | "TABLES" | "LAYOUT";

export type RetryConfig = {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
};

export type TextractConfig = {
  features: TextractFeature[];
};

export type ArchiveConfig = {
  maxDepth: number;
  maxFilesPerArchive: number;
};

export type ExtractionConfigProps = {
  detailLevel: ExtractionDetailLevel;
  retryConfig: RetryConfig;
  textractConfig: TextractConfig;
  archiveConfig: ArchiveConfig;
};

/**
 * Value object representing extraction configuration.
 * Validates all configuration properties and provides defaults.
 */
export class ExtractionConfig {
  private constructor(private readonly props: ExtractionConfigProps) {}

  private static readonly DEFAULT_CONFIG: ExtractionConfigProps = {
    detailLevel: "hybrid",
    retryConfig: {
      maxAttempts: 3,
      backoffMs: 1000,
      backoffMultiplier: 2,
    },
    textractConfig: {
      features: ["FORMS", "TABLES", "LAYOUT"],
    },
    archiveConfig: {
      maxDepth: 3,
      maxFilesPerArchive: 100,
    },
  };

  /**
   * Creates an ExtractionConfig with validation.
   */
  static create(
    props: Partial<ExtractionConfigProps>,
  ): Result<ExtractionConfig, ValidationError> {
    const config: ExtractionConfigProps = {
      detailLevel: props.detailLevel || this.DEFAULT_CONFIG.detailLevel,
      retryConfig: {
        ...this.DEFAULT_CONFIG.retryConfig,
        ...props.retryConfig,
      },
      textractConfig: {
        ...this.DEFAULT_CONFIG.textractConfig,
        ...props.textractConfig,
      },
      archiveConfig: {
        ...this.DEFAULT_CONFIG.archiveConfig,
        ...props.archiveConfig,
      },
    };

    const validationResult = this.validate(config);
    if (isErr(validationResult)) {
      return err(validationResult.error);
    }

    return ok(new ExtractionConfig(config));
  }

  /**
   * Creates an ExtractionConfig with default values.
   */
  static default(): ExtractionConfig {
    return new ExtractionConfig(this.DEFAULT_CONFIG);
  }

  /**
   * Validates the configuration properties.
   */
  private static validate(
    config: ExtractionConfigProps,
  ): Result<void, ValidationError> {
    const validDetailLevels: ExtractionDetailLevel[] = [
      "hybrid",
      "full",
      "text-only",
    ];
    if (!validDetailLevels.includes(config.detailLevel)) {
      return err(
        new ValidationError("Invalid detail level", {
          field: "detailLevel",
          value: config.detailLevel,
          validValues: validDetailLevels,
        }),
      );
    }

    if (
      config.retryConfig.maxAttempts < 0 ||
      config.retryConfig.maxAttempts > 10
    ) {
      return err(
        new ValidationError("Max attempts must be between 0 and 10", {
          field: "retryConfig.maxAttempts",
          value: config.retryConfig.maxAttempts,
        }),
      );
    }

    if (config.retryConfig.backoffMs < 0) {
      return err(
        new ValidationError("Backoff milliseconds must be positive", {
          field: "retryConfig.backoffMs",
          value: config.retryConfig.backoffMs,
        }),
      );
    }

    if (config.retryConfig.backoffMultiplier < 1) {
      return err(
        new ValidationError("Backoff multiplier must be at least 1", {
          field: "retryConfig.backoffMultiplier",
          value: config.retryConfig.backoffMultiplier,
        }),
      );
    }

    const validFeatures: TextractFeature[] = ["FORMS", "TABLES", "LAYOUT"];
    for (const feature of config.textractConfig.features) {
      if (!validFeatures.includes(feature)) {
        return err(
          new ValidationError("Invalid Textract feature", {
            field: "textractConfig.features",
            value: feature,
            validValues: validFeatures,
          }),
        );
      }
    }

    if (
      config.archiveConfig.maxDepth < 1 ||
      config.archiveConfig.maxDepth > 10
    ) {
      return err(
        new ValidationError("Max depth must be between 1 and 10", {
          field: "archiveConfig.maxDepth",
          value: config.archiveConfig.maxDepth,
        }),
      );
    }

    if (
      config.archiveConfig.maxFilesPerArchive < 1 ||
      config.archiveConfig.maxFilesPerArchive > 1000
    ) {
      return err(
        new ValidationError(
          "Max files per archive must be between 1 and 1000",
          {
            field: "archiveConfig.maxFilesPerArchive",
            value: config.archiveConfig.maxFilesPerArchive,
          },
        ),
      );
    }

    return ok(undefined);
  }

  /**
   * Returns the detail level.
   */
  getDetailLevel(): ExtractionDetailLevel {
    return this.props.detailLevel;
  }

  /**
   * Returns the retry configuration.
   */
  getRetryConfig(): RetryConfig {
    return { ...this.props.retryConfig };
  }

  /**
   * Returns the Textract configuration.
   */
  getTextractConfig(): TextractConfig {
    return {
      ...this.props.textractConfig,
      features: [...this.props.textractConfig.features],
    };
  }

  /**
   * Returns the archive configuration.
   */
  getArchiveConfig(): ArchiveConfig {
    return { ...this.props.archiveConfig };
  }

  /**
   * Creates a copy of this config with overridden properties.
   */
  withOverrides(
    overrides: Partial<ExtractionConfigProps>,
  ): Result<ExtractionConfig, ValidationError> {
    return ExtractionConfig.create({
      ...this.props,
      ...overrides,
    });
  }

  /**
   * Checks if the detail level is hybrid.
   */
  isHybridDetail(): boolean {
    return this.props.detailLevel === "hybrid";
  }

  /**
   * Checks if the detail level is full.
   */
  isFullDetail(): boolean {
    return this.props.detailLevel === "full";
  }

  /**
   * Checks if the detail level is text-only.
   */
  isTextOnly(): boolean {
    return this.props.detailLevel === "text-only";
  }
}
