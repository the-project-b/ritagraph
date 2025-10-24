import { createLogger } from "@the-project-b/logging";
import type { ExtractionResultDto } from "@the-project-b/file-extraction";
import { getThreadIdFromConfig } from "../../../utils/config-helper.js";
import type { Node, FailedAttachment, CostMetrics } from "../graph-state.js";

const logger = createLogger({ service: "rita-graphs" }).child({
  module: "FileExtraction",
  node: "formatOutput",
});

export const formatOutput: Node = async (state, config) => {
  const threadId = getThreadIdFromConfig(config);
  const language = state.preferredLanguage || "EN";

  logger.info("Formatting extraction output", {
    operation: "formatOutput",
    threadId,
    successCount: state.extractionResults.length,
    failureCount: state.failedAttachments.length,
    language,
  });

  const sections: string[] = [];

  if (state.extractionResults.length > 0) {
    sections.push(formatSuccessSection(state.extractionResults, language));
  }

  if (state.failedAttachments.length > 0) {
    sections.push(formatFailuresSection(state.failedAttachments, language));
  }

  if (state.totalCost) {
    sections.push(formatCostSection(state.totalCost, language));
  }

  const formattedOutput = sections.join("\n\n");

  logger.info("Output formatting complete", {
    threadId,
    outputLength: formattedOutput.length,
  });

  return {
    formattedOutput,
  };
};

function formatSuccessSection(
  results: ExtractionResultDto[],
  language: "EN" | "DE",
): string {
  const header =
    language === "DE"
      ? "## Erfolgreich extrahierte Dokumente"
      : "## Successfully Extracted Documents";

  const docs = results
    .map((result) => {
      const confidencePercent = (result.metadata.confidence * 100).toFixed(1);
      const preview =
        result.extractedText.length > 500
          ? `${result.extractedText.substring(0, 500)}...`
          : result.extractedText;

      return language === "DE"
        ? `### ${result.filename}\n- Seiten: ${result.metadata.pageCount}\n- Vertrauen: ${confidencePercent}%\n- Textlänge: ${result.extractedText.length} Zeichen\n\n${preview}`
        : `### ${result.filename}\n- Pages: ${result.metadata.pageCount}\n- Confidence: ${confidencePercent}%\n- Text length: ${result.extractedText.length} characters\n\n${preview}`;
    })
    .join("\n\n---\n\n");

  return `${header}\n\n${docs}`;
}

function formatFailuresSection(
  failures: FailedAttachment[],
  language: "EN" | "DE",
): string {
  const header =
    language === "DE"
      ? "## Fehlgeschlagene Extraktionen"
      : "## Failed Extractions";

  const failureList = failures
    .map((failure) => `- **${failure.filename}**: ${failure.error}`)
    .join("\n");

  return `${header}\n\n${failureList}`;
}

function formatCostSection(cost: CostMetrics, language: "EN" | "DE"): string {
  const costFormatted = cost.estimatedCostUSD.toFixed(4);

  return language === "DE"
    ? `## Kosten\n\n- Seiten verarbeitet: ${cost.pages}\n- API-Aufrufe: ${cost.apiCalls}\n- Geschätzte Kosten: $${costFormatted} USD`
    : `## Cost Summary\n\n- Pages processed: ${cost.pages}\n- API calls: ${cost.apiCalls}\n- Estimated cost: $${costFormatted} USD`;
}
