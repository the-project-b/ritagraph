import { ExternalServiceError } from "@the-project-b/types";

/**
 * Specialized error for AWS Textract service failures.
 * Extends ExternalServiceError from the types package.
 */
export class TextractServiceError extends ExternalServiceError {
  constructor(
    message: string,
    statusCode?: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: Record<string, any>,
  ) {
    super("AWS Textract", message, statusCode, context);
    this.name = "TextractServiceError";
  }
}
