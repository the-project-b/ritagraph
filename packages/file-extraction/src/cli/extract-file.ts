/* eslint-disable no-console */
import { readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import prompts from "prompts";
import { createLogger, normalizeError } from "@the-project-b/logging";
import { isErr } from "@the-project-b/types";
import { TextractAdapter } from "../infrastructure/adapters/TextractAdapter.js";
import { ExtractionConfig } from "../domain/value-objects/ExtractionConfig.value-object.js";
import type { ExtractionResultDto } from "../application/dto/ExtractionResult.dto.js";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "CLI-ExtractFile",
});

const SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif"];

function formatResult(result: ExtractionResultDto, format: string): string {
  switch (format) {
    case "text-only":
      return result.extractedText;

    case "hybrid": {
      let output = `# ${result.filename}\n\n`;
      output += `**Confidence:** ${(result.metadata.confidence * 100).toFixed(1)}%\n`;
      output += `**Pages:** ${result.metadata.pageCount}\n`;
      output += `**Language:** ${result.metadata.language}\n\n`;
      output += `## Extracted Text\n\n${result.extractedText}\n\n`;

      if (
        result.structuredData?.tables &&
        result.structuredData.tables.length > 0
      ) {
        output += `## Tables\n\n`;
        result.structuredData.tables.forEach((table, index) => {
          output += `### Table ${index + 1}\n\n`;
          if (table.rows.length > 0) {
            const header = table.rows[0];
            const separator = header.map(() => "---");
            const dataRows = table.rows.slice(1);
            output += `| ${header.join(" | ")} |\n`;
            output += `| ${separator.join(" | ")} |\n`;
            dataRows.forEach((row) => {
              output += `| ${row.join(" | ")} |\n`;
            });
          }
          output += `\n\n`;
        });
      }

      if (
        result.structuredData?.forms &&
        result.structuredData.forms.length > 0
      ) {
        output += `## Form Fields\n\n`;
        result.structuredData.forms.forEach((kv) => {
          output += `- **${kv.key}:** ${kv.value}\n`;
        });
      }

      return output;
    }

    case "full":
    default:
      return JSON.stringify(result, null, 2);
  }
}

async function main() {
  try {
    console.log("\n📄 File Extraction CLI\n");
    console.log(
      "Extract text from local PDF and image files using AWS Textract\n",
    );

    let filePath = process.argv[2];

    if (!filePath) {
      const response = await prompts({
        type: "text",
        name: "filePath",
        message: "Enter the path to the file you want to extract:",
        validate: (value) => {
          if (!value) return "File path is required";
          return true;
        },
      });

      if (!response.filePath) {
        console.log("\n❌ File path is required");
        process.exit(1);
      }

      filePath = response.filePath;
    }

    const filename = basename(filePath);
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      console.log(`\n❌ Unsupported file type: ${ext}`);
      console.log(`Supported types: ${SUPPORTED_EXTENSIONS.join(", ")}\n`);
      process.exit(1);
    }

    console.log(`\n📂 Reading file: ${filePath}\n`);

    let fileBuffer: Buffer;
    try {
      fileBuffer = readFileSync(filePath);
    } catch (error) {
      const { message } = normalizeError(error);
      console.log(`\n❌ Failed to read file: ${message}\n`);
      process.exit(1);
    }

    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📊 File size: ${fileSizeMB} MB`);
    console.log(`📝 File name: ${filename}\n`);

    const formatResponse = await prompts({
      type: "select",
      name: "format",
      message: "Select output format:",
      choices: [
        { title: "Hybrid (balanced)", value: "hybrid" },
        { title: "Full (all structured data)", value: "full" },
        { title: "Text only", value: "text-only" },
      ],
      initial: 0,
    });

    if (!formatResponse.format) {
      console.log("\n❌ Output format is required");
      process.exit(1);
    }

    console.log("\n🚀 Starting extraction...\n");
    console.log("This will:");
    console.log("  1. Send document to AWS Textract");
    console.log("  2. Analyze document with OCR");
    console.log("  3. Extract text, tables, and forms");
    console.log("  4. Parse and format results\n");

    const textractAdapter = new TextractAdapter();
    const config = ExtractionConfig.default();

    const extractionResult = await textractAdapter.extractTextFromBuffer(
      fileBuffer,
      filename,
      config,
    );

    if (isErr(extractionResult)) {
      console.log(
        `\n❌ Extraction failed: ${extractionResult.error.message}\n`,
      );
      process.exit(1);
    }

    const result = extractionResult.value;

    console.log("\n✅ Extraction completed successfully!\n");
    console.log("📊 Results:");
    console.log(`  - Text length: ${result.extractedText.length} characters`);
    console.log(
      `  - Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%`,
    );
    console.log(`  - Pages: ${result.metadata.pageCount}`);
    console.log(`  - Processing time: ${result.metadata.processingTimeMs}ms`);
    console.log(
      `  - Estimated cost: $${result.cost.estimatedCostUSD.toFixed(4)}`,
    );

    if (result.structuredData) {
      console.log(`  - Tables found: ${result.structuredData.tables.length}`);
      console.log(`  - Forms found: ${result.structuredData.forms.length}`);
    }

    const formattedOutput = formatResult(result, formatResponse.format);

    const outputFilename = `extraction-${filename.replace(/\.[^/.]+$/, "")}-${Date.now()}.json`;
    const outputPath = join(process.cwd(), outputFilename);

    const fullResults = {
      metadata: {
        sourceFile: filePath,
        filename,
        extractedAt: new Date().toISOString(),
        fileSizeMB: parseFloat(fileSizeMB),
        format: formatResponse.format,
      },
      extraction: {
        text: result.extractedText,
        confidence: result.metadata.confidence,
        pageCount: result.metadata.pageCount,
        processingTimeMs: result.metadata.processingTimeMs,
        cost: result.cost,
        structuredData: result.structuredData,
      },
      formatted: formattedOutput,
    };

    writeFileSync(outputPath, JSON.stringify(fullResults, null, 2), "utf-8");

    console.log(`\n📄 Results saved to: ${outputPath}\n`);

    console.log("\n📝 Formatted output preview:\n");
    console.log("─".repeat(80));
    console.log(
      formattedOutput.substring(0, 500) +
        (formattedOutput.length > 500 ? "\n...(truncated)" : ""),
    );
    console.log("─".repeat(80));
    console.log("\n✨ Done!\n");
  } catch (error) {
    const { error: normalizedError, message } = normalizeError(error);
    logger.error("CLI execution failed", normalizedError);
    console.log(`\n❌ Error: ${message}\n`);
    process.exit(1);
  }
}

main();
