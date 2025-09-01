import { FormatSimplePromptUseCase } from "./format-simple-prompt.use-case";
import { InMemoryPromptRepository } from "../../infrastructure/repositories/in-memory-prompt.repository";
import { Prompt } from "../../domain/entities/prompt.entity";
import { PromptCategory } from "../../domain/value-objects/prompt-metadata.value-object";
import { LanguageCode } from "../../domain/value-objects/language-code.value-object";
import { Result } from "../../shared/types/result";

describe("FormatSimplePromptUseCase", () => {
  let useCase: FormatSimplePromptUseCase;
  let repository: InMemoryPromptRepository;

  beforeEach(async () => {
    repository = new InMemoryPromptRepository();
    useCase = new FormatSimplePromptUseCase(repository);

    // Setup test prompts in repository
    const promptResult = Prompt.create({
      id: "test-prompt-1",
      name: "greeting",
      category: PromptCategory.COMMUNICATION,
      templates: {
        EN: "Hello {name}, welcome to {product}!",
        DE: "Hallo {name}, willkommen bei {product}!",
      },
      metadata: {
        version: "1.0.0",
        tags: ["greeting", "welcome"],
      },
    });

    if (Result.isSuccess(promptResult)) {
      await repository.save(Result.unwrap(promptResult));
    }

    const staticPromptResult = Prompt.create({
      id: "static-prompt",
      name: "static-message",
      templates: {
        EN: "This is a static message without variables",
      },
    });

    if (Result.isSuccess(staticPromptResult)) {
      await repository.save(Result.unwrap(staticPromptResult));
    }
  });

  describe("execute", () => {
    it("should format a prompt with variables", async () => {
      const result = await useCase.execute({
        promptName: "greeting",
        variables: {
          name: "Alice",
          product: "Rita",
        },
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.content).toBe("Hello Alice, welcome to Rita!");
        expect(response.metadata.promptName).toBe("greeting");
        expect(response.metadata.languageUsed).toBe("EN");
        expect(response.metadata.variablesProvided).toEqual({
          name: "Alice",
          product: "Rita",
        });
        expect(response.metadata.correlationId).toBeDefined();
      }
    });

    it("should format a prompt with specific language", async () => {
      const langResult = LanguageCode.fromString("DE");
      if (!Result.isSuccess(langResult)) return;

      const result = await useCase.execute({
        promptName: "greeting",
        variables: {
          name: "Bob",
          product: "Graphs",
        },
        language: Result.unwrap(langResult),
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.content).toBe("Hallo Bob, willkommen bei Graphs!");
        expect(response.metadata.languageUsed).toBe("DE");
      }
    });

    it("should format a prompt without variables", async () => {
      const result = await useCase.execute({
        promptName: "static-message",
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.content).toBe(
          "This is a static message without variables",
        );
      }
    });

    it("should use provided correlation ID", async () => {
      const correlationId = "test-correlation-123";
      const result = await useCase.execute({
        promptName: "greeting",
        variables: { name: "Test", product: "App" },
        correlationId,
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.metadata.correlationId).toBe(correlationId);
      }
    });

    it("should generate correlation ID if not provided", async () => {
      const result = await useCase.execute({
        promptName: "greeting",
        variables: { name: "Test", product: "App" },
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.metadata.correlationId).toBeDefined();
        expect(response.metadata.correlationId).toMatch(/^prompt-\d+-\w+$/);
      }
    });

    it("should handle non-existent prompt", async () => {
      const result = await useCase.execute({
        promptName: "non-existent",
        variables: {},
      });

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain("not found");
      }
    });

    it("should fail when required variables are missing", async () => {
      const result = await useCase.execute({
        promptName: "greeting",
        variables: {
          name: "Alice",
          // product is missing
        },
      });

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain("Missing required variables");
        expect(error.message).toContain("product");
      }
    });
  });

  describe("executeWithTruncation", () => {
    it("should truncate content when exceeding max length", async () => {
      const result = await useCase.executeWithTruncation({
        promptName: "static-message",
        maxLength: 20,
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.content.length).toBe(20);
        expect(response.content).toBe("This is a static mes");
        expect(response.metadata.truncations).toBeDefined();
        expect(response.metadata.truncations?.[0]).toMatchObject({
          field: "content",
          truncatedTo: 20,
        });
        expect(
          response.metadata.truncations?.[0].originalLength,
        ).toBeGreaterThan(20);
      }
    });

    it("should not truncate when content is within limit", async () => {
      const result = await useCase.executeWithTruncation({
        promptName: "static-message",
        maxLength: 100,
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.content).toBe(
          "This is a static message without variables",
        );
        expect(response.metadata.truncations).toBeUndefined();
      }
    });

    it("should use default max length if not provided", async () => {
      const result = await useCase.executeWithTruncation({
        promptName: "static-message",
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.content.length).toBeLessThanOrEqual(2500);
      }
    });

    it("should handle truncation with variables", async () => {
      const result = await useCase.executeWithTruncation({
        promptName: "greeting",
        variables: {
          name: "VeryVeryVeryLongNameThatExceedsLimit",
          product: "X",
        },
        maxLength: 25,
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const response = Result.unwrap(result);
        expect(response.content.length).toBe(25);
        expect(response.metadata.truncations).toBeDefined();
      }
    });

    it("should handle non-existent prompt for truncation", async () => {
      const result = await useCase.executeWithTruncation({
        promptName: "non-existent",
        maxLength: 100,
      });

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain("not found");
      }
    });
  });
});
