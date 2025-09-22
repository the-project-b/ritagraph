import { TemplateProcessor } from "./template-processor";
import { TemplateContext } from "./template-variable-registry";

describe("TemplateProcessor", () => {
  const testContext: TemplateContext = {
    currentDate: new Date("2024-09-18"),
  };

  // Save original delimiters
  let originalDelimiters: any;

  beforeEach(() => {
    originalDelimiters = TemplateProcessor.getDelimiters();
  });

  afterEach(() => {
    // Reset to original delimiters after each test
    TemplateProcessor.setDelimiters(originalDelimiters);
  });

  describe("process", () => {
    it("should process single template variable", () => {
      const input = "Update salary starting {{currentMonth}}";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe("Update salary starting September");
      expect(result.replacements).toHaveLength(1);
      expect(result.replacements[0].expression).toBe("currentMonth");
      expect(result.replacements[0].result.displayValue).toBe("September");
    });

    it("should process multiple template variables", () => {
      const input =
        "From {{currentMonth}} to {{currentMonth+3}} in year {{currentYear}}";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe("From September to December in year 2024");
      expect(result.replacements).toHaveLength(3);
      expect(result.metadata["currentMonth"]).toBeDefined();
      expect(result.metadata["currentMonth+3"]).toBeDefined();
      expect(result.metadata["currentYear"]).toBeDefined();
    });

    it("should handle arithmetic in templates", () => {
      const input = "Starting {{currentMonth+2}} ending {{currentMonth+6}}";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe("Starting November ending March 2025");
      expect(result.replacements).toHaveLength(2);
    });

    it("should preserve non-template text", () => {
      const input = "This has no templates at all";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe(input);
      expect(result.replacements).toHaveLength(0);
      expect(Object.keys(result.metadata)).toHaveLength(0);
    });

    it("should handle invalid template variables", () => {
      const input = "Valid: {{currentMonth}} Invalid: {{nonExistent}}";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe(
        "Valid: September Invalid: {{nonExistent}}",
      );
      expect(result.replacements).toHaveLength(1);
    });

    it("should handle nested braces correctly", () => {
      const input = 'JSON: {"key": "{{currentMonth}}"}';
      const result = TemplateProcessor.process(input, testContext);

      // With the improved regex, it correctly identifies and replaces only the template variable
      expect(result.processed).toBe('JSON: {"key": "September"}');
      expect(result.replacements).toHaveLength(1);
    });

    it("should only process valid template expressions", () => {
      const input = 'Valid: {{currentMonth}} JSON: {"not": "template"}';
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe(
        'Valid: September JSON: {"not": "template"}',
      );
      expect(result.replacements).toHaveLength(1);
      expect(result.replacements[0].expression).toBe("currentMonth");
    });

    it("should maintain correct indices after replacements", () => {
      const input = "{{currentMonth}} and {{currentYear}}";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe("September and 2024");
      // First replacement: {{currentMonth}} -> September
      expect(result.replacements[0].startIndex).toBe(0);
      expect(result.replacements[0].endIndex).toBe(16); // End of "{{currentMonth}}" in original
      // Second replacement: {{currentYear}} -> 2024
      // After first replacement, offset changes by (9 - 16) = -7
      expect(result.replacements[1].startIndex).toBe(14); // Start after "September and " in processed
      expect(result.replacements[1].endIndex).toBe(29); // End after full replacement in original with offset
    });

    it("should handle empty string", () => {
      const result = TemplateProcessor.process("", testContext);

      expect(result.processed).toBe("");
      expect(result.replacements).toHaveLength(0);
    });

    it("should handle templates with whitespace", () => {
      const input = "Date: {{ currentMonth }} (ignored)";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe("Date: {{ currentMonth }} (ignored)");
      expect(result.replacements).toHaveLength(0);
    });

    it("should populate metadata correctly", () => {
      const input = "{{currentMonth+3}} and {{currentYear}}";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.metadata["currentMonth+3"]).toBeDefined();
      expect(result.metadata["currentMonth+3"].displayValue).toBe("December");
      expect(result.metadata["currentMonth+3"].dataValue).toBe(
        "2024-12-01T00:00:00.000Z",
      );

      expect(result.metadata["currentYear"]).toBeDefined();
      expect(result.metadata["currentYear"].displayValue).toBe("2024");
      expect(result.metadata["currentYear"].dataValue).toBe(2024);
    });
  });

  describe("hasTemplates", () => {
    it("should detect presence of templates", () => {
      expect(
        TemplateProcessor.hasTemplates("Has {{currentMonth}} template"),
      ).toBe(true);
      expect(TemplateProcessor.hasTemplates("No templates here")).toBe(false);
      expect(TemplateProcessor.hasTemplates("{{multiple}} {{templates}}")).toBe(
        true,
      );
      expect(TemplateProcessor.hasTemplates("")).toBe(false);
    });

    it("should not be fooled by similar patterns", () => {
      expect(TemplateProcessor.hasTemplates("Array[0]")).toBe(false);
      expect(TemplateProcessor.hasTemplates("Object{{key}}")).toBe(true);
    });
  });

  describe("extractExpressions", () => {
    it("should extract all template expressions", () => {
      const input = "Has {{currentMonth}} and {{currentYear+1}} templates";
      const expressions = TemplateProcessor.extractExpressions(input);

      expect(expressions).toEqual(["currentMonth", "currentYear+1"]);
    });

    it("should handle duplicate expressions", () => {
      const input = "{{currentMonth}} and {{currentMonth}} again";
      const expressions = TemplateProcessor.extractExpressions(input);

      expect(expressions).toEqual(["currentMonth", "currentMonth"]);
    });

    it("should return empty array for no templates", () => {
      const expressions = TemplateProcessor.extractExpressions("No templates");

      expect(expressions).toEqual([]);
    });

    it("should extract complex expressions", () => {
      const input = "{{currentMonth+3}} {{currentYear-10}} {{today}}";
      const expressions = TemplateProcessor.extractExpressions(input);

      expect(expressions).toEqual([
        "currentMonth+3",
        "currentYear-10",
        "today",
      ]);
    });
  });

  describe("Configurable delimiters", () => {
    it("should use double braces by default", () => {
      const delimiters = TemplateProcessor.getDelimiters();
      expect(delimiters.start).toBe("{{");
      expect(delimiters.end).toBe("}}");

      const input = "Test {{currentMonth}} template";
      const result = TemplateProcessor.process(input, testContext);
      expect(result.processed).toBe("Test September template");
    });

    it("should support custom delimiters like square brackets", () => {
      TemplateProcessor.setDelimiters({ start: "[", end: "]" });

      const input = "Test [currentMonth] template";
      const result = TemplateProcessor.process(input, testContext);
      expect(result.processed).toBe("Test September template");

      // Should not process double braces
      const input2 = "Test {{currentMonth}} template";
      const result2 = TemplateProcessor.process(input2, testContext);
      expect(result2.processed).toBe("Test {{currentMonth}} template");
    });

    it("should support single braces when configured", () => {
      TemplateProcessor.setDelimiters({ start: "{", end: "}" });

      const input = "Test {currentMonth} template";
      const result = TemplateProcessor.process(input, testContext);
      expect(result.processed).toBe("Test September template");
    });

    it("should handle special regex characters in delimiters", () => {
      TemplateProcessor.setDelimiters({ start: "$(", end: ")$" });

      const input = "Test $(currentMonth)$ template";
      const result = TemplateProcessor.process(input, testContext);
      expect(result.processed).toBe("Test September template");
    });

    it("should work with hasTemplates for custom delimiters", () => {
      TemplateProcessor.setDelimiters({ start: "[[", end: "]]" });

      expect(
        TemplateProcessor.hasTemplates("Has [[currentMonth]] template"),
      ).toBe(true);
      expect(TemplateProcessor.hasTemplates("No templates here")).toBe(false);
      expect(
        TemplateProcessor.hasTemplates("Wrong {{currentMonth}} delimiters"),
      ).toBe(false);
    });

    it("should work with extractExpressions for custom delimiters", () => {
      TemplateProcessor.setDelimiters({ start: "<%", end: "%>" });

      const input = "Has <%currentMonth%> and <%currentYear+1%> templates";
      const expressions = TemplateProcessor.extractExpressions(input);
      expect(expressions).toEqual(["currentMonth", "currentYear+1"]);
    });
  });

  describe("Edge cases", () => {
    it("should handle consecutive templates", () => {
      const input = "{{currentMonth}}{{currentYear}}";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe("September2024");
      expect(result.replacements).toHaveLength(2);
    });

    it("should handle template at start and end", () => {
      const input = "{{currentMonth}} text {{currentYear}}";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe("September text 2024");
    });

    it("should handle very long input strings", () => {
      const longText = "x".repeat(10000);
      const input = `${longText}{{currentMonth}}${longText}`;
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe(`${longText}September${longText}`);
      expect(result.replacements).toHaveLength(1);
    });

    it("should handle special characters in surrounding text", () => {
      const input = "!@#${{currentMonth}}%^&*()";
      const result = TemplateProcessor.process(input, testContext);

      expect(result.processed).toBe("!@#$September%^&*()");
    });

    it("should process templates with different date contexts", () => {
      const februaryContext: TemplateContext = {
        currentDate: new Date("2024-02-29"),
      };

      const input = "Leap year: {{currentMonth}} {{currentDay}}";
      const result = TemplateProcessor.process(input, februaryContext);

      expect(result.processed).toBe("Leap year: February 29");
    });

    it("should handle year boundary transitions", () => {
      const decemberContext: TemplateContext = {
        currentDate: new Date("2024-12-15"),
      };

      const input = "From {{currentMonth}} to {{currentMonth+2}}";
      const result = TemplateProcessor.process(input, decemberContext);

      expect(result.processed).toBe("From December to February 2025");
    });
  });
});
