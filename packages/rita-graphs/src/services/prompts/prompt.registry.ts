import { promptService } from "./prompt.service.js";
import { Result } from "@the-project-b/prompts";
import { createLogger } from "@the-project-b/logging";

const logger = createLogger({ service: "prompt-registry" });

/**
 * Registry for all prompts used in Rita graphs.
 * Registers prompts in the in-memory repository for local development.
 */
export class PromptRegistry {
  private static initialized = false;

  /**
   * Initialize all prompts in the registry.
   * This should be called once during application startup.
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug("Prompt registry already initialized");
      return;
    }

    logger.info("Initializing prompt registry");

    // Register all prompts
    await this.registerTitleGenerationPrompt();

    this.initialized = true;
    logger.info("Prompt registry initialized successfully");
  }

  static async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      logger.info("Prompt registry not initialized, initializing");
      await this.initialize();
    }
  }

  /**
   * Register the title generation prompt with language-specific templates.
   */
  private static async registerTitleGenerationPrompt(): Promise<void> {
    const result = await promptService.registerPrompt({
      name: "generate-title-system",
      templates: {
        EN: `You are a professional payroll system assistant. Generate a concise, descriptive title for this conversation.

The user's preferred language is: {languageText}

The title should:
- Be maximum 50 characters
- Summarize the main topic or request
- Use professional, clear language
- Be written in {languageText}
- Be informative but NOT include specific numbers or amounts
- Focus on the type of change or request, not the exact values

Good examples in {languageText}:
{examples}

Conversation context (including initial request):
{conversationContext}`,
        DE: `Sie sind ein professioneller Assistent f�r Lohnabrechnungssysteme. Erstellen Sie einen pr�gnanten, beschreibenden Titel f�r diese Unterhaltung.

Die bevorzugte Sprache des Benutzers ist: {languageText}

Der Titel sollte:
- Maximal 50 Zeichen lang sein
- Das Hauptthema oder die Anfrage zusammenfassen
- Professionelle, klare Sprache verwenden
- In {languageText} geschrieben sein
- Informativ sein, aber KEINE spezifischen Zahlen oder Betr�ge enthalten
- Sich auf die Art der �nderung oder Anfrage konzentrieren, nicht auf die genauen Werte

Gute Beispiele in {languageText}:
{examples}

Gespr�chskontext (einschlie�lich der ersten Anfrage):
{conversationContext}`,
      },
      metadata: {
        description: "System prompt for generating conversation titles",
        version: "1.0.0",
        tags: ["title", "generation", "conversation"],
      },
      source: "memory",
    });

    if (Result.isFailure(result)) {
      logger.error("Failed to register title generation prompt", {
        error: Result.unwrapFailure(result),
      });
      throw Result.unwrapFailure(result);
    }

    logger.debug("Title generation prompt registered successfully");
  }

  /**
   * Check if the registry has been initialized.
   */
  static isInitialized(): boolean {
    return this.initialized;
  }
}
