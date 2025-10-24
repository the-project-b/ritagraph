import { ExtractionConfigProps } from "../../domain/value-objects/ExtractionConfig.value-object.js";

export type ExtractAttachmentsDto = {
  attachmentIds: string[];
  config?: Partial<ExtractionConfigProps>;
  companyId: string;
  userId: string;
  authToken: string;
};

export type ExtractAttachmentsConfigDto = Partial<ExtractionConfigProps>;
