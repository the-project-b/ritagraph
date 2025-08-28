import { Result } from "../../shared/types/result.js";
import { ValidationError } from "../../shared/errors/domain.errors.js";

/**
 * Immutable value object representing a language code.
 * Enforces supported languages and provides type-safe language handling.
 */
export class LanguageCode {
  // #region Singleton Instances
  static readonly EN = new LanguageCode("EN", "English");
  static readonly DE = new LanguageCode("DE", "German");
  // #endregion

  // #region Constants
  private static readonly SUPPORTED_LANGUAGES = new Map<string, LanguageCode>([
    ["EN", LanguageCode.EN],
    ["DE", LanguageCode.DE],
  ]);

  private static readonly DEFAULT_LANGUAGE = LanguageCode.EN;
  // #endregion

  private constructor(
    private readonly code: string,
    private readonly displayName: string,
  ) {}

  // #region Factory Methods
  /**
   * Creates a LanguageCode from a string value.
   * @param value - The language code string (e.g., "EN", "DE")
   * @returns Result<LanguageCode, ValidationError> - Success with LanguageCode or validation error
   */
  static fromString(value: string): Result<LanguageCode, ValidationError> {
    if (!value || typeof value !== "string") {
      return Result.failure(
        new ValidationError(
          "Language code must be a non-empty string",
          "languageCode",
        ),
      );
    }

    const upperValue = value.toUpperCase().trim();
    const language = LanguageCode.SUPPORTED_LANGUAGES.get(upperValue);

    if (!language) {
      const supported = Array.from(LanguageCode.SUPPORTED_LANGUAGES.keys());
      return Result.failure(
        new ValidationError(
          `Language '${value}' is not supported. Supported languages: ${supported.join(", ")}`,
          "languageCode",
        ),
      );
    }

    return Result.success(language);
  }

  /**
   * Returns the default language (English).
   * @returns LanguageCode - The default language code
   */
  static getDefault(): LanguageCode {
    return LanguageCode.DEFAULT_LANGUAGE;
  }

  /**
   * Gets all supported language codes.
   * @returns LanguageCode[] - Array of all supported languages
   */
  static getAllSupported(): LanguageCode[] {
    return Array.from(LanguageCode.SUPPORTED_LANGUAGES.values());
  }

  /**
   * Checks if a language code is supported.
   * @param code - The language code to check
   * @returns boolean - True if the language is supported
   */
  static isSupported(code: string): boolean {
    return LanguageCode.SUPPORTED_LANGUAGES.has(code.toUpperCase());
  }
  // #endregion

  // #region Getters
  /**
   * Returns the language code value.
   * @returns string - The language code (e.g., "EN", "DE")
   */
  getCode(): string {
    return this.code;
  }

  /**
   * Returns the human-readable display name.
   * @returns string - The language display name (e.g., "English", "German")
   */
  getDisplayName(): string {
    return this.displayName;
  }

  /**
   * Returns the language code as a string.
   * @returns string - The language code
   */
  toString(): string {
    return this.code;
  }
  // #endregion

  // #region Comparison
  /**
   * Checks equality with another LanguageCode.
   * @param other - The LanguageCode to compare with
   * @returns boolean - True if codes are equal
   */
  equals(other: LanguageCode): boolean {
    return this.code === other.code;
  }

  /**
   * Checks if this is the default language.
   * @returns boolean - True if this is the default language
   */
  isDefault(): boolean {
    return this.equals(LanguageCode.DEFAULT_LANGUAGE);
  }
  // #endregion
}
