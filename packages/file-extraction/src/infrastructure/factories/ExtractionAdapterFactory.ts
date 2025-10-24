import { ExtractionAdapter } from "../adapters/ExtractionAdapter.interface.js";
import { TextractAdapter } from "../adapters/TextractAdapter.js";
import { MockAdapter } from "../adapters/MockAdapter.js";
import { S3Client } from "../clients/S3Client.js";
import { TextractClient } from "../clients/TextractClient.js";

export type ExtractionAdapterType = "textract" | "mock";

export type ExtractionAdapterConfig = {
  type: ExtractionAdapterType;
  region?: string;
};

/**
 * Factory for creating extraction adapters.
 * Supports Textract and Mock adapters, with easy extension for future providers.
 */
export class ExtractionAdapterFactory {
  /**
   * Creates an extraction adapter based on configuration.
   */
  static create(config: ExtractionAdapterConfig): ExtractionAdapter {
    switch (config.type) {
      case "textract":
        return new TextractAdapter(
          new TextractClient(config.region),
          new S3Client(config.region),
          config.region,
        );

      case "mock":
        return new MockAdapter();

      default:
        throw new Error(`Unsupported extraction adapter type: ${config.type}`);
    }
  }

  /**
   * Creates an adapter from environment variables.
   */
  static createFromEnv(): ExtractionAdapter {
    const type = (process.env.FILE_EXTRACTION_ADAPTER_TYPE ||
      "textract") as ExtractionAdapterType;
    const region = process.env.AWS_REGION;

    return this.create({ type, region });
  }
}
