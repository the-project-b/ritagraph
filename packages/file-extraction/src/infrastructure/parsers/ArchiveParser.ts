import { createLogger, normalizeError } from "@the-project-b/logging";
import { err, InfrastructureError, ok, Result } from "@the-project-b/types";
import * as unzipper from "unzipper";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "ArchiveParser",
});

export type ExtractedFile = {
  path: string;
  content: Buffer;
  size: number;
};

/**
 * Parser for archive files (zip, tar, tar.gz).
 * Does some beep boop on archives within archives to allow recursiveness
 */
export class ArchiveParser {
  /**
   * Extracts files from a zip archive.
   */
  async extractZip(
    archiveBuffer: Buffer,
    maxFiles: number = 100,
    maxDepth: number = 3,
  ): Promise<Result<ExtractedFile[], InfrastructureError>> {
    try {
      logger.info("Extracting zip archive", {
        size: archiveBuffer.length,
        maxFiles,
        maxDepth,
      });

      const files: ExtractedFile[] = [];
      const directory = await unzipper.Open.buffer(archiveBuffer);

      for (const file of directory.files) {
        if (file.type === "File") {
          if (files.length >= maxFiles) {
            logger.warn("Max file limit reached during zip extraction", {
              maxFiles,
            });
            break;
          }

          const depth = file.path.split("/").length - 1;

          if (depth > maxDepth) {
            logger.warn("Skipping file due to depth limit", {
              path: file.path,
              depth,
              maxDepth,
            });
            continue;
          }

          const content = await file.buffer();

          files.push({
            path: file.path,
            content,
            size: content.length,
          });
        }
      }

      logger.info("Zip archive extracted", {
        fileCount: files.length,
      });

      return ok(files);
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);

      logger.error("Failed to extract zip archive", normalizedError, {
        errorMessage: message,
      });

      return err(
        new InfrastructureError(
          `Failed to extract zip archive: ${message}`,
          "ARCHIVE_EXTRACTION_ERROR",
          { error: message },
        ),
      );
    }
  }

  /**
   * Extracts files from a tar or tar.gz archive.
   */
  async extractTar(
    _archiveBuffer: Buffer,
    _maxFiles: number = 100,
    _maxDepth: number = 3,
    isGzipped: boolean = false,
  ): Promise<Result<ExtractedFile[], InfrastructureError>> {
    return err(
      new InfrastructureError(
        "Tar extraction not yet implemented",
        "NOT_IMPLEMENTED",
        { isGzipped },
      ),
    );
  }

  /**
   * Determines archive type from filename and delegates to appropriate extractor.
   */
  async extractArchive(
    filename: string,
    archiveBuffer: Buffer,
    maxFiles: number = 100,
    maxDepth: number = 3,
  ): Promise<Result<ExtractedFile[], InfrastructureError>> {
    const lowerFilename = filename.toLowerCase();

    if (lowerFilename.endsWith(".zip")) {
      return this.extractZip(archiveBuffer, maxFiles, maxDepth);
    }

    if (lowerFilename.endsWith(".tar.gz") || lowerFilename.endsWith(".tgz")) {
      return this.extractTar(archiveBuffer, maxFiles, maxDepth, true);
    }

    if (lowerFilename.endsWith(".tar")) {
      return this.extractTar(archiveBuffer, maxFiles, maxDepth, false);
    }

    return err(
      new InfrastructureError(
        "Unsupported archive type",
        "UNSUPPORTED_ARCHIVE",
        { filename },
      ),
    );
  }

  /**
   * Filters extracted files to only include processable file types.
   */
  filterProcessableFiles(files: ExtractedFile[]): ExtractedFile[] {
    const supportedExtensions = [
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".tiff",
      ".tif",
    ];

    return files.filter((file) => {
      const ext = file.path.toLowerCase().split(".").pop();
      return ext && supportedExtensions.includes(`.${ext}`);
    });
  }
}
