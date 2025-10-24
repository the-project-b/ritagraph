import { Annotation, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ExtractionResultDto } from "@the-project-b/file-extraction";

function AnnotationWithDefault<T>(defaultValue: T) {
  return Annotation<T>({
    value: (currentValue: T, update?: T) => update || currentValue,
    default: () => defaultValue,
  });
}

export const ConfigurableAnnotation = Annotation.Root({
  backupAccessToken: AnnotationWithDefault<string | undefined>(undefined),
  backupCompanyId: AnnotationWithDefault<string | undefined>(undefined),
});

export const FileExtractionBaseAnnotation = Annotation.Root({
  attachmentIds: Annotation<string[]>(),
  selectedCompanyId: Annotation<string>(),
  preferredLanguage: AnnotationWithDefault<"EN" | "DE">("DE"),
  rolesRitaShouldBeVisibleTo: AnnotationWithDefault<Array<number> | null>(null),
});

export type ExtractionJob = {
  attachmentId: string;
  jobId: string;
  status: "STARTED" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
  filename: string;
  s3Location?: string;
};

export type FailedAttachment = {
  attachmentId: string;
  filename: string;
  error: string;
};

export type CostMetrics = {
  pages: number;
  apiCalls: number;
  estimatedCostUSD: number;
};

export const GraphState = Annotation.Root({
  ...FileExtractionBaseAnnotation.spec,

  extractionJobs: AnnotationWithDefault<ExtractionJob[]>([]),
  extractionResults: AnnotationWithDefault<ExtractionResultDto[]>([]),
  failedAttachments: AnnotationWithDefault<FailedAttachment[]>([]),
  formattedOutput: Annotation<string | undefined>(),
  totalCost: Annotation<CostMetrics | undefined>(),
});

export type GraphStateType = typeof GraphState.State;

export type Node<State = GraphStateType> = (
  state: State,
  config?: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
  getAuthUser?: (
    config: LangGraphRunnableConfig<typeof ConfigurableAnnotation.State>,
  ) => any,
) => Promise<Partial<State> | null> | Partial<State> | null;
