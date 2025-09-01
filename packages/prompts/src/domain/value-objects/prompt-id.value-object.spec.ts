import { PromptId } from "./prompt-id.value-object";
import { Result } from "../../shared/types/result";

describe("PromptId Value Object", () => {
  describe("create", () => {
    it("should create a valid prompt ID", () => {
      const result = PromptId.create("valid-prompt-id");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const id = Result.unwrap(result);
        expect(id.toString()).toBe("valid-prompt-id");
      }
    });

    it("should fail for empty string", () => {
      const result = PromptId.create("");

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain("Prompt ID must be a non-empty string");
      }
    });

    it("should fail for whitespace-only string", () => {
      const result = PromptId.create("   ");

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain(
          "Prompt ID must be at least 3 characters",
        );
      }
    });

    it("should fail for ID that is too short", () => {
      const result = PromptId.create("ab");

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain(
          "Prompt ID must be at least 3 characters",
        );
      }
    });

    it("should fail for ID that is too long", () => {
      const longId = "a".repeat(101);
      const result = PromptId.create(longId);

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain(
          "Prompt ID must not exceed 100 characters",
        );
      }
    });

    it("should fail for ID with invalid characters", () => {
      const result = PromptId.create("invalid@id#123");

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        const error = Result.unwrapFailure(result);
        expect(error.message).toContain(
          "Prompt ID must start with alphanumeric",
        );
      }
    });

    it("should accept ID with valid characters", () => {
      const result = PromptId.create("valid_id-123.test");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const id = Result.unwrap(result);
        expect(id.toString()).toBe("valid_id-123.test");
      }
    });

    it("should accept ID at minimum length", () => {
      const result = PromptId.create("abc");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const id = Result.unwrap(result);
        expect(id.toString()).toBe("abc");
      }
    });

    it("should accept ID at maximum length", () => {
      const maxId = "a".repeat(100);
      const result = PromptId.create(maxId);

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const id = Result.unwrap(result);
        expect(id.toString()).toBe(maxId);
      }
    });
  });

  describe("equals", () => {
    it("should return true for same IDs", () => {
      const result1 = PromptId.create("same-id");
      const result2 = PromptId.create("same-id");

      if (!Result.isSuccess(result1) || !Result.isSuccess(result2)) return;

      const id1 = Result.unwrap(result1);
      const id2 = Result.unwrap(result2);

      expect(id1.equals(id2)).toBe(true);
    });

    it("should return false for different IDs", () => {
      const result1 = PromptId.create("id-one");
      const result2 = PromptId.create("id-two");

      if (!Result.isSuccess(result1) || !Result.isSuccess(result2)) return;

      const id1 = Result.unwrap(result1);
      const id2 = Result.unwrap(result2);

      expect(id1.equals(id2)).toBe(false);
    });

    it("should be case-sensitive", () => {
      const result1 = PromptId.create("Test-ID");
      const result2 = PromptId.create("test-id");

      if (!Result.isSuccess(result1) || !Result.isSuccess(result2)) return;

      const id1 = Result.unwrap(result1);
      const id2 = Result.unwrap(result2);

      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe("toString", () => {
    it("should return the ID value", () => {
      const result = PromptId.create("test-id-123");

      if (!Result.isSuccess(result)) return;

      const id = Result.unwrap(result);
      expect(id.toString()).toBe("test-id-123");
    });
  });

  describe("getValue", () => {
    it("should return the ID value", () => {
      const result = PromptId.create("test-value-456");

      if (!Result.isSuccess(result)) return;

      const id = Result.unwrap(result);
      expect(id.getValue()).toBe("test-value-456");
    });
  });

  describe("fromString", () => {
    it("should create a valid ID from string", () => {
      const result = PromptId.fromString("from-string-id");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const id = Result.unwrap(result);
        expect(id.toString()).toBe("from-string-id");
      }
    });

    it("should fail for invalid string", () => {
      const result = PromptId.fromString("");

      expect(Result.isFailure(result)).toBe(true);
    });
  });
});
