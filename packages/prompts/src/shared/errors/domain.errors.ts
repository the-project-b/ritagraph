export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, "VALIDATION_ERROR");
  }
}

export class NotFoundError extends DomainError {
  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string,
  ) {
    super(`${resourceType} with id '${resourceId}' not found`, "NOT_FOUND");
  }
}

export class FormatError extends DomainError {
  constructor(
    message: string,
    public readonly missingVariables?: string[],
    public readonly invalidVariables?: string[],
  ) {
    super(message, "FORMAT_ERROR");
  }
}

export class PromptCreationError extends DomainError {
  constructor(
    message: string,
    public readonly violations: string[],
  ) {
    super(message, "PROMPT_CREATION_ERROR");
  }
}

export class LanguageNotSupportedError extends DomainError {
  constructor(
    public readonly languageCode: string,
    public readonly supportedLanguages: string[],
  ) {
    super(
      `Language '${languageCode}' is not supported. Supported languages: ${supportedLanguages.join(", ")}`,
      "LANGUAGE_NOT_SUPPORTED",
    );
  }
}

export class PersistenceError extends DomainError {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message, "PERSISTENCE_ERROR");
  }
}

export class InvalidArgumentError extends DomainError {
  constructor(
    public readonly argumentName: string,
    message: string,
  ) {
    super(`Invalid argument '${argumentName}': ${message}`, "INVALID_ARGUMENT");
  }
}
