import { PromptTemplate } from "./prompt-template.value-object";
import { Result } from "../../shared/types/result";

describe("PromptTemplate Value Object", () => {
  describe("create", () => {
    it("should create a valid template", () => {
      const result = PromptTemplate.create("Hello {name}!");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const template = Result.unwrap(result);
        expect(template.getTemplate()).toBe("Hello {name}!");
      }
    });

    it("should accept empty template", () => {
      const result = PromptTemplate.create("");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const template = Result.unwrap(result);
        expect(template.getTemplate()).toBe("");
      }
    });

    it("should accept whitespace-only template", () => {
      const result = PromptTemplate.create("   \n\t  ");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const template = Result.unwrap(result);
        expect(template.getTemplate()).toBe("   \n\t  ");
      }
    });

    it("should accept template without placeholders", () => {
      const result = PromptTemplate.create("Static text without variables");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const template = Result.unwrap(result);
        expect(Array.from(template.getPlaceholders())).toEqual([]);
      }
    });

    it("should extract single placeholder", () => {
      const result = PromptTemplate.create("Hello {name}!");

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const template = Result.unwrap(result);
        expect(Array.from(template.getPlaceholders())).toEqual(["name"]);
      }
    });

    it("should extract multiple placeholders", () => {
      const result = PromptTemplate.create(
        "Hello {firstName} {lastName}, welcome to {product}!",
      );

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const template = Result.unwrap(result);
        expect(Array.from(template.getPlaceholders()).sort()).toEqual(
          ["firstName", "lastName", "product"].sort(),
        );
      }
    });

    it("should handle duplicate placeholders", () => {
      const result = PromptTemplate.create(
        "Hello {name}! Nice to meet you, {name}.",
      );

      expect(Result.isSuccess(result)).toBe(true);
      if (Result.isSuccess(result)) {
        const template = Result.unwrap(result);
        expect(Array.from(template.getPlaceholders())).toEqual(["name"]);
      }
    });
  });

  describe("format", () => {
    it("should format template with all variables", () => {
      const result = PromptTemplate.create(
        "Hello {name}, welcome to {product}!",
      );
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        name: "Alice",
        product: "Rita",
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("Hello Alice, welcome to Rita!");
        expect(output.placeholdersReplaced).toEqual(["name", "product"]);
      }
    });

    it("should format template without placeholders", () => {
      const result = PromptTemplate.create("Static message");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({});

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("Static message");
        expect(output.placeholdersReplaced).toEqual([]);
      }
    });

    it("should format with extra variables (ignored)", () => {
      const result = PromptTemplate.create("Hello {name}!");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        name: "Bob",
        extra: "ignored",
        another: "also ignored",
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("Hello Bob!");
        expect(output.placeholdersReplaced).toEqual(["name"]);
      }
    });

    it("should fail when missing required variables", () => {
      const result = PromptTemplate.create("Hello {firstName} {lastName}!");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        firstName: "John",
        // lastName missing
      });

      expect(Result.isFailure(formatted)).toBe(true);
      if (Result.isFailure(formatted)) {
        const error = Result.unwrapFailure(formatted);
        expect(error.message).toContain("Missing required variables");
        expect(error.message).toContain("lastName");
      }
    });

    it("should handle null values", () => {
      const result = PromptTemplate.create("Value: {value}");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        value: null,
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("Value: ");
      }
    });

    it("should handle undefined values", () => {
      const result = PromptTemplate.create("Value: {value}");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        value: undefined,
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("Value: ");
      }
    });

    it("should convert numbers to strings", () => {
      const result = PromptTemplate.create("Number: {num}, Float: {float}");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        num: 42,
        float: 3.14159,
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("Number: 42, Float: 3.14159");
      }
    });

    it("should convert booleans to strings", () => {
      const result = PromptTemplate.create("True: {yes}, False: {no}");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        yes: true,
        no: false,
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("True: true, False: false");
      }
    });

    it("should handle arrays by joining with newlines", () => {
      const result = PromptTemplate.create("List:\n{items}");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        items: ["item1", "item2", "item3"],
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("List:\nitem1\nitem2\nitem3");
      }
    });

    it("should handle objects by JSON stringification", () => {
      const result = PromptTemplate.create("Data: {obj}");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        obj: { name: "test", value: 123 },
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toContain('"name": "test"');
        expect(output.content).toContain('"value": 123');
      }
    });

    it("should handle duplicate placeholders with same value", () => {
      const result = PromptTemplate.create("Hello {name}! {name} is awesome!");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      const formatted = template.format({
        name: "Alice",
      });

      expect(Result.isSuccess(formatted)).toBe(true);
      if (Result.isSuccess(formatted)) {
        const output = Result.unwrap(formatted);
        expect(output.content).toBe("Hello Alice! Alice is awesome!");
      }
    });
  });

  describe("hasPlaceholder", () => {
    it("should return true for existing placeholder", () => {
      const result = PromptTemplate.create("Hello {name}!");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      expect(template.hasPlaceholder("name")).toBe(true);
    });

    it("should return false for non-existing placeholder", () => {
      const result = PromptTemplate.create("Hello {name}!");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      expect(template.hasPlaceholder("age")).toBe(false);
    });

    it("should return false for template without placeholders", () => {
      const result = PromptTemplate.create("Static text");
      if (!Result.isSuccess(result)) return;

      const template = Result.unwrap(result);
      expect(template.hasPlaceholder("any")).toBe(false);
    });
  });

  describe("equals", () => {
    it("should return true for identical templates", () => {
      const result1 = PromptTemplate.create("Hello {name}!");
      const result2 = PromptTemplate.create("Hello {name}!");

      if (!Result.isSuccess(result1) || !Result.isSuccess(result2)) return;

      const template1 = Result.unwrap(result1);
      const template2 = Result.unwrap(result2);

      expect(template1.equals(template2)).toBe(true);
    });

    it("should return false for different templates", () => {
      const result1 = PromptTemplate.create("Hello {name}!");
      const result2 = PromptTemplate.create("Hi {name}!");

      if (!Result.isSuccess(result1) || !Result.isSuccess(result2)) return;

      const template1 = Result.unwrap(result1);
      const template2 = Result.unwrap(result2);

      expect(template1.equals(template2)).toBe(false);
    });

    it("should return false for templates with different placeholders", () => {
      const result1 = PromptTemplate.create("Hello {name}!");
      const result2 = PromptTemplate.create("Hello {firstName}!");

      if (!Result.isSuccess(result1) || !Result.isSuccess(result2)) return;

      const template1 = Result.unwrap(result1);
      const template2 = Result.unwrap(result2);

      expect(template1.equals(template2)).toBe(false);
    });
  });
});
