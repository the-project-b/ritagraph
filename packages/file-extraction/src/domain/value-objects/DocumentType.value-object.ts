import { Result, ok, err, ValidationError } from "@the-project-b/types";

export type SupportedDocumentType =
  | "pdf"
  | "jpeg"
  | "png"
  | "tiff"
  | "zip"
  | "tar"
  | "tar.gz";

/**
 * Value object representing a document file type.
 * Validates supported formats and provides type checking methods.
 */
export class DocumentType {
  private constructor(private readonly value: SupportedDocumentType) {}

  private static readonly SUPPORTED_IMAGE_TYPES: SupportedDocumentType[] = [
    "jpeg",
    "png",
    "tiff",
  ];

  private static readonly SUPPORTED_DOCUMENT_TYPES: SupportedDocumentType[] = [
    "pdf",
  ];

  private static readonly SUPPORTED_ARCHIVE_TYPES: SupportedDocumentType[] = [
    "zip",
    "tar",
    "tar.gz",
  ];

  private static readonly ALL_SUPPORTED_TYPES: SupportedDocumentType[] = [
    ...DocumentType.SUPPORTED_IMAGE_TYPES,
    ...DocumentType.SUPPORTED_DOCUMENT_TYPES,
    ...DocumentType.SUPPORTED_ARCHIVE_TYPES,
  ];

  private static readonly MIME_TYPE_MAP: Record<string, SupportedDocumentType> =
    {
      "application/pdf": "pdf",
      "image/jpeg": "jpeg",
      "image/jpg": "jpeg",
      "image/png": "png",
      "image/tiff": "tiff",
      "image/tif": "tiff",
      "application/zip": "zip",
      "application/x-tar": "tar",
      "application/gzip": "tar.gz",
      "application/x-gzip": "tar.gz",
    };

  /**
   * Creates a DocumentType from a string value.
   */
  static create(type: string): Result<DocumentType, ValidationError> {
    const normalizedType = type.toLowerCase();

    if (
      !this.ALL_SUPPORTED_TYPES.includes(
        normalizedType as SupportedDocumentType,
      )
    ) {
      return err(
        new ValidationError("Unsupported document type", {
          field: "type",
          value: type,
          supportedTypes: this.ALL_SUPPORTED_TYPES,
        }),
      );
    }

    return ok(new DocumentType(normalizedType as SupportedDocumentType));
  }

  /**
   * Creates a DocumentType from a MIME type string.
   */
  static fromMimeType(mimeType: string): Result<DocumentType, ValidationError> {
    const normalizedMime = mimeType.toLowerCase();
    const documentType = this.MIME_TYPE_MAP[normalizedMime];

    if (!documentType) {
      return err(
        new ValidationError("Unsupported MIME type", {
          field: "mimeType",
          value: mimeType,
          supportedMimeTypes: Object.keys(this.MIME_TYPE_MAP),
        }),
      );
    }

    return ok(new DocumentType(documentType));
  }

  /**
   * Creates a DocumentType from a filename by extracting the extension.
   */
  static fromFilename(filename: string): Result<DocumentType, ValidationError> {
    const lowerFilename = filename.toLowerCase();

    if (lowerFilename.endsWith(".tar.gz") || lowerFilename.endsWith(".tgz")) {
      return ok(new DocumentType("tar.gz"));
    }

    const extension = lowerFilename.split(".").pop();

    if (!extension) {
      return err(
        new ValidationError("Cannot determine file type from filename", {
          field: "filename",
          value: filename,
        }),
      );
    }

    const extensionMap: Record<string, SupportedDocumentType> = {
      pdf: "pdf",
      jpg: "jpeg",
      jpeg: "jpeg",
      png: "png",
      tif: "tiff",
      tiff: "tiff",
      zip: "zip",
      tar: "tar",
      gz: "tar.gz",
    };

    const documentType = extensionMap[extension];

    if (!documentType) {
      return err(
        new ValidationError("Unsupported file extension", {
          field: "extension",
          value: extension,
          filename,
          supportedExtensions: Object.keys(extensionMap),
        }),
      );
    }

    return ok(new DocumentType(documentType));
  }

  /**
   * Returns the string representation of the document type.
   */
  toString(): string {
    return this.value;
  }

  /**
   * Checks if the document is an image type.
   */
  isImage(): boolean {
    return DocumentType.SUPPORTED_IMAGE_TYPES.includes(this.value);
  }

  /**
   * Checks if the document is a PDF.
   */
  isPdf(): boolean {
    return this.value === "pdf";
  }

  /**
   * Checks if the document is an archive.
   */
  isArchive(): boolean {
    return DocumentType.SUPPORTED_ARCHIVE_TYPES.includes(this.value);
  }

  /**
   * Checks if the document can be directly processed by Textract.
   */
  isTextractCompatible(): boolean {
    return this.isImage() || this.isPdf();
  }

  /**
   * Checks equality with another DocumentType.
   */
  equals(other: DocumentType): boolean {
    return this.value === other.value;
  }
}
