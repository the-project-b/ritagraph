import { InMemoryPromptRepository } from "./in-memory-prompt.repository";
import { Prompt } from "../../domain/entities/prompt.entity";
import { PromptId } from "../../domain/value-objects/prompt-id.value-object";
import { PromptCategory } from "../../domain/value-objects/prompt-metadata.value-object";
import { LanguageCode } from "../../domain/value-objects/language-code.value-object";
import { Result } from "../../shared/types/result";

describe("InMemoryPromptRepository", () => {
  let repository: InMemoryPromptRepository;
  let testPrompt1: Prompt;
  let testPrompt2: Prompt;

  beforeEach(() => {
    repository = new InMemoryPromptRepository();

    const promptResult1 = Prompt.create({
      id: "test-prompt-1",
      name: "greeting",
      category: PromptCategory.COMMUNICATION,
      templates: {
        EN: "Hello {name}!",
        DE: "Hallo {name}!",
      },
      metadata: {
        tags: ["greeting", "welcome"],
        owner: "user1",
      },
    });

    const promptResult2 = Prompt.create({
      id: "test-prompt-2",
      name: "workflow",
      category: PromptCategory.WORKFLOW,
      templates: {
        EN: "Process {task}",
      },
      metadata: {
        tags: ["workflow", "task"],
        owner: "user2",
      },
    });

    if (Result.isSuccess(promptResult1)) {
      testPrompt1 = Result.unwrap(promptResult1);
    }
    if (Result.isSuccess(promptResult2)) {
      testPrompt2 = Result.unwrap(promptResult2);
    }
  });

  describe("save", () => {
    it("should save a prompt successfully", async () => {
      const result = await repository.save(testPrompt1);
      expect(Result.isSuccess(result)).toBe(true);
    });

    it("should be retrievable after saving", async () => {
      await repository.save(testPrompt1);
      const findResult = await repository.findById(testPrompt1.getId());

      expect(Result.isSuccess(findResult)).toBe(true);
      if (Result.isSuccess(findResult)) {
        const found = Result.unwrap(findResult);
        expect(found.getName()).toBe("greeting");
      }
    });

    it("should be findable by name after saving", async () => {
      await repository.save(testPrompt1);
      const findResult = await repository.findByName("greeting");

      expect(Result.isSuccess(findResult)).toBe(true);
      if (Result.isSuccess(findResult)) {
        const found = Result.unwrap(findResult);
        expect(found.getId().toString()).toBe("test-prompt-1");
      }
    });
  });

  describe("findById", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
      await repository.save(testPrompt2);
    });

    it("should find prompt by ID", async () => {
      const result = await repository.findById(testPrompt1.getId());

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompt = Result.unwrap(result);
        expect(prompt.getName()).toBe("greeting");
      }
    });

    it("should return NotFoundError for non-existent ID", async () => {
      const idResult = PromptId.create("non-existent-id");
      if (!Result.isSuccess(idResult)) return;

      const result = await repository.findById(Result.unwrap(idResult));

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.resourceType).toBe("Prompt");
        expect(error.resourceId).toBe("non-existent-id");
      }
    });
  });

  describe("findByName", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
      await repository.save(testPrompt2);
    });

    it("should find prompt by name", async () => {
      const result = await repository.findByName("workflow");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompt = Result.unwrap(result);
        expect(prompt.getId().toString()).toBe("test-prompt-2");
      }
    });

    it("should return NotFoundError for non-existent name", async () => {
      const result = await repository.findByName("non-existent");

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.resourceType).toBe("Prompt");
      }
    });
  });

  describe("update", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
    });

    it("should update an existing prompt", async () => {
      const updateResult = testPrompt1.updateMetadata({
        tags: ["updated", "tags"],
      });
      expect(Result.isSuccess(updateResult)).toBe(true);

      const result = await repository.update(testPrompt1);
      expect(Result.isSuccess(result)).toBe(true);

      const findResult = await repository.findById(testPrompt1.getId());
      if (Result.isSuccess(findResult)) {
        const found = Result.unwrap(findResult);
        expect(found.getMetadata().getTags()).toEqual(["updated", "tags"]);
      }
    });

    it("should fail to update non-existent prompt", async () => {
      const newPromptResult = Prompt.create({
        id: "new-prompt",
        name: "new",
        templates: { EN: "New" },
      });

      if (!Result.isSuccess(newPromptResult)) return;
      const newPrompt = Result.unwrap(newPromptResult);

      const result = await repository.update(newPrompt);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain("Cannot update non-existent prompt");
      }
    });
  });

  describe("delete", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
    });

    it("should delete an existing prompt", async () => {
      const result = await repository.delete(testPrompt1.getId());
      expect(Result.isSuccess(result)).toBe(true);

      const findResult = await repository.findById(testPrompt1.getId());
      expect(Result.isFailure(findResult)).toBe(true);
    });

    it("should also remove from name index", async () => {
      await repository.delete(testPrompt1.getId());

      const findResult = await repository.findByName("greeting");
      expect(Result.isFailure(findResult)).toBe(true);
    });

    it("should return NotFoundError for non-existent prompt", async () => {
      const idResult = PromptId.create("non-existent-id");
      if (!Result.isSuccess(idResult)) return;

      const result = await repository.delete(Result.unwrap(idResult));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect((error as any).resourceType).toBe("Prompt");
      }
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
      await repository.save(testPrompt2);
    });

    it("should list all prompts", async () => {
      const result = await repository.list();

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(2);
      }
    });

    it("should filter by category", async () => {
      const result = await repository.list({
        category: PromptCategory.COMMUNICATION,
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(1);
        expect(prompts[0].getName()).toBe("greeting");
      }
    });

    it("should filter by tags", async () => {
      const result = await repository.list({
        tags: ["workflow"],
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(1);
        expect(prompts[0].getName()).toBe("workflow");
      }
    });

    it("should filter by owner", async () => {
      const result = await repository.list({
        owner: "user1",
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(1);
        expect(prompts[0].getName()).toBe("greeting");
      }
    });

    it("should filter by language", async () => {
      const langResult = LanguageCode.fromString("DE");
      if (!Result.isSuccess(langResult)) return;

      const result = await repository.list({
        language: Result.unwrap(langResult),
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(1); // Only greeting has DE
        expect(prompts[0].getName()).toBe("greeting");
      }
    });

    it("should filter by name pattern", async () => {
      const result = await repository.list({
        namePattern: "work",
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(1);
        expect(prompts[0].getName()).toBe("workflow");
      }
    });

    it("should handle multiple filters", async () => {
      const result = await repository.list({
        category: PromptCategory.COMMUNICATION,
        tags: ["greeting"],
        owner: "user1",
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(1);
        expect(prompts[0].getName()).toBe("greeting");
      }
    });
  });

  describe("findByCategory", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
      await repository.save(testPrompt2);
    });

    it("should find prompts by category", async () => {
      const result = await repository.findByCategory(PromptCategory.WORKFLOW);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(1);
        expect(prompts[0].getName()).toBe("workflow");
      }
    });

    it("should return empty array for category with no prompts", async () => {
      const result = await repository.findByCategory(PromptCategory.SYSTEM);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(0);
      }
    });
  });

  describe("findByTags", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
      await repository.save(testPrompt2);
    });

    it("should find prompts with any matching tag", async () => {
      const result = await repository.findByTags(["greeting", "task"]);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(2);
      }
    });

    it("should return empty array for non-matching tags", async () => {
      const result = await repository.findByTags(["nonexistent"]);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(0);
      }
    });
  });

  describe("exists", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
    });

    it("should return true for existing prompt", async () => {
      const exists = await repository.exists(testPrompt1.getId());
      expect(exists).toBe(true);
    });

    it("should return false for non-existing prompt", async () => {
      const idResult = PromptId.create("non-existent-id");
      if (!Result.isSuccess(idResult)) return;

      const exists = await repository.exists(Result.unwrap(idResult));
      expect(exists).toBe(false);
    });
  });

  describe("count", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
      await repository.save(testPrompt2);
    });

    it("should count all prompts", async () => {
      const result = await repository.count();

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(Result.unwrap(result)).toBe(2);
      }
    });

    it("should count filtered prompts", async () => {
      const result = await repository.count({
        category: PromptCategory.COMMUNICATION,
      });

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        expect(Result.unwrap(result)).toBe(1);
      }
    });
  });

  describe("getStats", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
      await repository.save(testPrompt2);
    });

    it("should return repository statistics", () => {
      const stats = repository.getStats();

      expect(stats.totalPrompts).toBe(2);
      expect(stats.uniqueNames).toBe(2);
      expect(stats.categories).toContain(PromptCategory.COMMUNICATION);
      expect(stats.categories).toContain(PromptCategory.WORKFLOW);
      expect(stats.languages).toContain("EN");
      expect(stats.languages).toContain("DE");
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      await repository.save(testPrompt1);
      await repository.save(testPrompt2);
    });

    it("should clear all prompts", async () => {
      repository.clear();

      const result = await repository.list();
      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const prompts = Result.unwrap(result);
        expect(prompts).toHaveLength(0);
      }

      const stats = repository.getStats();
      expect(stats.totalPrompts).toBe(0);
    });
  });
});
