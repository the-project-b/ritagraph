import { Result } from "../../shared/types/result";
import { LanguageCode } from "../value-objects/language-code.value-object";
import { PromptCategory } from "../value-objects/prompt-metadata.value-object";
import { Prompt } from "./prompt.entity";

describe("Prompt Entity", () => {
  describe("create", () => {
    it("should create a valid prompt with required fields", () => {
      const result = Prompt.create({
        id: "test-prompt-1",
        name: "test-prompt",
        templates: {
          EN: "Hello {name}!",
        },
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompt = Result.unwrap(result);
        expect(prompt.getName()).toBe("test-prompt");
        expect(prompt.getId().toString()).toBe("test-prompt-1");
      }
    });

    it("should create a prompt with multiple language templates", () => {
      const result = Prompt.create({
        id: "multilang-prompt",
        name: "greeting",
        templates: {
          EN: "Hello {name}!",
          DE: "Hallo {name}!",
        },
        category: PromptCategory.COMMUNICATION,
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompt = Result.unwrap(result);
        expect(prompt.getAvailableLanguages()).toHaveLength(2);
        expect(prompt.hasLanguage(LanguageCode.getDefault())).toBe(true);
      }
    });

    it("should fail when id is invalid", () => {
      const result = Prompt.create({
        id: "x", // Too short
        name: "test",
        templates: { EN: "Test" },
      });

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain("Failed to create prompt");
      }
    });

    it("should fail when name is empty", () => {
      const result = Prompt.create({
        id: "valid-id",
        name: "",
        templates: { EN: "Test" },
      });

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.violations).toContain("Name is required");
      }
    });

    it("should fail when no templates provided", () => {
      const result = Prompt.create({
        id: "valid-id",
        name: "test",
        templates: {},
      });

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.violations).toContain("At least one template is required");
      }
    });

    it("should create prompt with metadata", () => {
      const result = Prompt.create({
        id: "metadata-prompt",
        name: "test",
        templates: { EN: "Test" },
        metadata: {
          version: "1.0.0",
          tags: ["test", "example"],
          owner: "test-user",
          description: "Test prompt",
        },
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompt = Result.unwrap(result);
        const metadata = prompt.getMetadata();
        expect(metadata.getVersion()).toBe("1.0.0");
        expect(metadata.getTags()).toEqual(["test", "example"]);
        expect(metadata.getOwner()).toBe("test-user");
        expect(metadata.getDescription()).toBe("Test prompt");
      }
    });
  });

  describe("format", () => {
    let testPrompt: Prompt;

    beforeEach(() => {
      const result = Prompt.create({
        id: "format-test",
        name: "formatter",
        templates: {
          EN: "Hello {name}, welcome to {product}!",
          DE: "Hallo {name}, willkommen bei {product}!",
        },
      });
      if (Result.isSuccess(result)) {
        testPrompt = Result.unwrap(result);
      }
    });

    it("should format template with variables", () => {
      const result = testPrompt.format({
        name: "Alice",
        product: "Rita",
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const formatted = Result.unwrap(result);
        expect(formatted.content).toBe("Hello Alice, welcome to Rita!");
        expect(formatted.metadata.promptName).toBe("formatter");
        expect(formatted.metadata.languageUsed).toBe("EN");
        expect(formatted.metadata.variablesProvided).toEqual({
          name: "Alice",
          product: "Rita",
        });
      }
    });

    it("should format with specific language", () => {
      const langResult = LanguageCode.fromString("DE");
      if (!Result.isSuccess(langResult)) return;

      const result = testPrompt.format(
        { name: "Bob", product: "Graphs" },
        Result.unwrap(langResult),
      );

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const formatted = Result.unwrap(result);
        expect(formatted.content).toBe("Hallo Bob, willkommen bei Graphs!");
        expect(formatted.metadata.languageUsed).toBe("DE");
      }
    });

    it("should fallback to default language when requested language not available", () => {
      const singleLangResult = Prompt.create({
        id: "single-lang",
        name: "single",
        templates: { EN: "English only: {text}" },
      });

      if (!Result.isSuccess(singleLangResult)) return;
      const prompt = Result.unwrap(singleLangResult);

      const langResult = LanguageCode.fromString("DE");
      if (!Result.isSuccess(langResult)) return;

      const formatResult = prompt.format(
        { text: "test" },
        Result.unwrap(langResult),
      );

      expect(Result.isSuccess(formatResult)).toBe(true);
      if (Result.isSuccess(formatResult)) {
        const formatted = Result.unwrap(formatResult);
        expect(formatted.content).toBe("English only: test");
        // It uses EN as fallback but reports DE in metadata
        expect(formatted.metadata.languageUsed).toBe("DE");
      }
    });

    it("should format without variables", () => {
      const staticResult = Prompt.create({
        id: "static",
        name: "static",
        templates: { EN: "No variables here" },
      });

      if (!Result.isSuccess(staticResult)) return;
      const prompt = Result.unwrap(staticResult);

      const result = prompt.format({});
      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const formatted = Result.unwrap(result);
        expect(formatted.content).toBe("No variables here");
      }
    });
  });

  describe("formatWithTruncation", () => {
    it("should truncate content when exceeding max length", () => {
      const result = Prompt.create({
        id: "truncate-test",
        name: "truncate",
        templates: { EN: "This is a very long message that will be truncated" },
      });

      if (!Result.isSuccess(result)) return;
      const prompt = Result.unwrap(result);

      const formatted = prompt.formatWithTruncation(
        {},
        LanguageCode.getDefault(),
        20,
      );

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content.length).toBe(20);
        expect(output.metadata.truncations).toBeDefined();
        expect(output.metadata.truncations?.[0]).toMatchObject({
          field: "content",
          truncatedTo: 20,
        });
        expect(output.metadata.truncations?.[0].originalLength).toBeGreaterThan(
          20,
        );
      }
    });

    it("should not truncate when content is within limit", () => {
      const result = Prompt.create({
        id: "short-test",
        name: "short",
        templates: { EN: "Short" },
      });

      if (!Result.isSuccess(result)) return;
      const prompt = Result.unwrap(result);

      const formatted = prompt.formatWithTruncation(
        {},
        LanguageCode.getDefault(),
        100,
      );

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("Short");
        expect(output.metadata.truncations).toBeUndefined();
      }
    });
  });

  describe("addLanguageVariant", () => {
    it("should add new language variant", () => {
      const result = Prompt.create({
        id: "lang-test",
        name: "lang",
        templates: { EN: "English" },
      });

      if (!Result.isSuccess(result)) return;
      const prompt = Result.unwrap(result);

      const langResult = LanguageCode.fromString("DE");
      if (!Result.isSuccess(langResult)) return;

      const addResult = prompt.addLanguageVariant(
        Result.unwrap(langResult),
        "Deutsch",
      );

      expect(Result.isSuccess(addResult)).toBe(true);
      expect(prompt.hasLanguage(Result.unwrap(langResult))).toBe(true);
      expect(prompt.getAvailableLanguages()).toHaveLength(2);
    });

    it("should update existing language variant", () => {
      const result = Prompt.create({
        id: "update-test",
        name: "update",
        templates: { EN: "Original" },
      });

      if (!Result.isSuccess(result)) return;
      const prompt = Result.unwrap(result);

      const updateResult = prompt.addLanguageVariant(
        LanguageCode.getDefault(),
        "Updated",
      );

      expect(Result.isSuccess(updateResult)).toBe(true);

      const formatResult = prompt.format({});
      if (Result.isSuccess(formatResult)) {
        expect(Result.unwrap(formatResult).content).toBe("Updated");
      }
    });
  });

  describe("updateMetadata", () => {
    it("should update metadata fields", () => {
      const result = Prompt.create({
        id: "metadata-update",
        name: "meta",
        templates: { EN: "Test" },
        metadata: {
          version: "1.0.0",
          tags: ["original"],
        },
      });

      if (!Result.isSuccess(result)) return;
      const prompt = Result.unwrap(result);

      const updateResult = prompt.updateMetadata({
        version: "2.0.0",
        tags: ["updated", "new"],
        owner: "new-owner",
      });

      expect(Result.isSuccess(updateResult)).toBe(true);
      const metadata = prompt.getMetadata();
      expect(metadata.getVersion()).toBe("2.0.0");
      expect(metadata.getTags()).toEqual(["updated", "new"]);
      expect(metadata.getOwner()).toBe("new-owner");
    });

    it("should preserve unchanged metadata fields", () => {
      const result = Prompt.create({
        id: "preserve-test",
        name: "preserve",
        templates: { EN: "Test" },
        metadata: {
          version: "1.0.0",
          description: "Original description",
        },
      });

      if (!Result.isSuccess(result)) return;
      const prompt = Result.unwrap(result);

      const updateResult = prompt.updateMetadata({
        version: "2.0.0",
      });

      expect(Result.isSuccess(updateResult)).toBe(true);
      const metadata = prompt.getMetadata();
      expect(metadata.getVersion()).toBe("2.0.0");
      expect(metadata.getDescription()).toBe("Original description");
    });
  });

  describe("getters", () => {
    let prompt: Prompt;

    beforeEach(() => {
      const result = Prompt.create({
        id: "getter-test",
        name: "getters",
        category: PromptCategory.WORKFLOW,
        templates: {
          EN: "English",
          DE: "German",
        },
        metadata: {
          version: "1.2.3",
          tags: ["test"],
        },
      });
      if (Result.isSuccess(result)) {
        prompt = Result.unwrap(result);
      }
    });

    it("should return correct values from getters", () => {
      expect(prompt.getId().toString()).toBe("getter-test");
      expect(prompt.getName()).toBe("getters");
      expect(prompt.getMetadata().getCategory()).toBe(PromptCategory.WORKFLOW);
      expect(prompt.getAvailableLanguages()).toHaveLength(2);
      expect(prompt.hasLanguage(LanguageCode.getDefault())).toBe(true);
      expect(prompt.getCreatedAt()).toBeInstanceOf(Date);
      expect(prompt.getUpdatedAt()).toBeInstanceOf(Date);
    });
  });
});
