import { TransformerRegistry } from "./transformer-registry";
import { TemplateVariableRegistry } from "./template-variable-registry";

describe("TransformerRegistry", () => {
  describe("Predefined transformers", () => {
    it("should have all default transformers", () => {
      expect(TransformerRegistry.has("transformer-today-utc")).toBe(true);
      expect(TransformerRegistry.has("transformer-today-utc-for-change")).toBe(
        true,
      );
      expect(
        TransformerRegistry.has("transformer-today-utc-for-creation"),
      ).toBe(true);
      expect(TransformerRegistry.has("transformer-uppercase")).toBe(true);
      expect(TransformerRegistry.has("transformer-lowercase")).toBe(true);
      expect(TransformerRegistry.has("transformer-trim")).toBe(true);
    });

    it("should apply transformer-uppercase correctly", () => {
      const transformer = TransformerRegistry.get("transformer-uppercase");
      expect(transformer).toBeDefined();

      const result = transformer.transform("hello world", {
        path: "test",
        isExpected: true,
      });
      expect(result).toBe("HELLO WORLD");
    });

    it("should apply transformer-lowercase correctly", () => {
      const transformer = TransformerRegistry.get("transformer-lowercase");
      expect(transformer).toBeDefined();

      const result = transformer.transform("HELLO WORLD", {
        path: "test",
        isExpected: true,
      });
      expect(result).toBe("hello world");
    });

    it("should apply conditional transformer based on changeType", () => {
      const transformer = TransformerRegistry.get(
        "transformer-today-utc-for-change",
      );
      expect(transformer).toBeDefined();
      expect(transformer.when).toBeDefined();
      expect(transformer.conditionTarget).toBe("actual");
    });
  });

  describe("Dynamic template-based transformers", () => {
    it("should create transformer for currentMonth expression", () => {
      const key = "transformer-template-currentMonth";
      const transformer = TransformerRegistry.get(key);

      expect(transformer).toBeDefined();
      expect(transformer.key).toBe(key);
      expect(transformer.strategy).toBe("add-missing-only");
    });

    it("should create transformer for arithmetic expressions", () => {
      const key = "transformer-template-currentMonth+3";
      const transformer = TransformerRegistry.get(key);

      expect(transformer).toBeDefined();
      expect(transformer.key).toBe(key);

      const testDate = new Date("2024-09-18");
      const result = transformer.transform(undefined, {
        path: "test",
        isExpected: true,
        currentDate: testDate,
      });

      expect(result).toBe("2024-12-01T00:00:00.000Z");
    });

    it("should cache dynamically created transformers", () => {
      const key = "transformer-template-currentYear+5";
      const transformer1 = TransformerRegistry.get(key);
      const transformer2 = TransformerRegistry.get(key);

      expect(transformer1).toBe(transformer2);
    });

    it("should return undefined for invalid template expressions", () => {
      const transformer = TransformerRegistry.get(
        "transformer-template-invalidVar",
      );
      expect(transformer).toBeUndefined();
    });

    it("should check existence of dynamic transformers", () => {
      expect(TransformerRegistry.has("transformer-template-currentMonth")).toBe(
        true,
      );
      expect(
        TransformerRegistry.has("transformer-template-currentMonth+10"),
      ).toBe(true);
      expect(TransformerRegistry.has("transformer-template-nonExistent")).toBe(
        false,
      );
    });

    it("should produce same value as template variable", () => {
      const expression = "currentMonth+2";
      const testDate = new Date("2024-09-18");
      const context = { currentDate: testDate };

      const templateResult = TemplateVariableRegistry.evaluateExpression(
        expression,
        context,
      );

      const transformerKey = `transformer-template-${expression}`;
      const transformer = TransformerRegistry.get(transformerKey);
      const transformerResult = transformer.transform(undefined, {
        path: "test",
        isExpected: true,
        currentDate: testDate,
      });

      expect(transformerResult).toBe(templateResult.dataValue);
    });

    it("should handle subtraction in dynamic transformers", () => {
      const transformer = TransformerRegistry.get(
        "transformer-template-currentYear-5",
      );
      expect(transformer).toBeDefined();

      const result = transformer.transform(undefined, {
        path: "test",
        isExpected: true,
        currentDate: new Date("2024-09-18"),
      });

      expect(result).toBe(2019);
    });

    it("should handle currentDay arithmetic", () => {
      const transformer = TransformerRegistry.get(
        "transformer-template-currentDay+10",
      );
      expect(transformer).toBeDefined();

      const result = transformer.transform(undefined, {
        path: "test",
        isExpected: true,
        currentDate: new Date("2024-09-18"),
      });

      expect(result).toBe("2024-09-28T00:00:00.000Z");
    });

    it("should return original value if template evaluation fails", () => {
      const transformer = TransformerRegistry.get(
        "transformer-template-currentMonth",
      );

      const originalValue = "original";
      const result = transformer.transform(originalValue, {
        path: "test",
        isExpected: true,
        currentDate: null,
      });

      expect(result).toBeDefined();
    });
  });

  describe("Registry operations", () => {
    it("should list all transformer keys", () => {
      const keys = TransformerRegistry.getKeys();

      expect(keys).toContain("transformer-today-utc");
      expect(keys).toContain("transformer-uppercase");
      expect(keys).toContain("transformer-lowercase");
    });

    it("should get all transformers", () => {
      const all = TransformerRegistry.getAll();

      expect(all.length).toBeGreaterThan(0);
      expect(all.some((t) => t.key === "transformer-today-utc")).toBe(true);
    });

    it("should handle non-existent transformer keys", () => {
      const transformer = TransformerRegistry.get("non-existent-transformer");
      expect(transformer).toBeUndefined();
    });

    it("should not confuse regular transformers with template prefix", () => {
      const transformer = TransformerRegistry.get("transformer-template");
      expect(transformer).toBeUndefined();
    });
  });
});
