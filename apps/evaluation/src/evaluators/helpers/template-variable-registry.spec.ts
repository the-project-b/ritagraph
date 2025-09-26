import {
  TemplateContext,
  TemplateVariableRegistry,
} from "./template-variable-registry";

describe("TemplateVariableRegistry", () => {
  describe("Template Variable Registration", () => {
    it("should have predefined template variables", () => {
      expect(TemplateVariableRegistry.has("currentMonth")).toBe(true);
      expect(TemplateVariableRegistry.has("currentYear")).toBe(true);
      expect(TemplateVariableRegistry.has("currentDay")).toBe(true);
      expect(TemplateVariableRegistry.has("today")).toBe(true);
    });

    it("should allow registering new template variables", () => {
      const customVariable = {
        key: "customVar",
        description: "Custom test variable",
        evaluate: (context: TemplateContext) => ({
          displayValue: "custom",
          dataValue: "custom-data",
        }),
      };

      TemplateVariableRegistry.register(customVariable);
      expect(TemplateVariableRegistry.has("customVar")).toBe(true);

      const result = TemplateVariableRegistry.evaluateExpression("customVar", {
        currentDate: new Date(),
      });
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("custom");
      expect(result?.dataValue).toBe("custom-data");
    });
  });

  describe("currentMonth template variable", () => {
    it("should return month name for current year", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentMonth",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("September");
      expect(result?.dataValue).toBe("2024-09-01T00:00:00.000Z");
    });

    it("should support addition arithmetic", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentMonth+3",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("December");
      expect(result?.dataValue).toBe("2024-12-01T00:00:00.000Z");
    });

    it("should support subtraction arithmetic", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentMonth-2",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("July");
      expect(result?.dataValue).toBe("2024-07-01T00:00:00.000Z");
    });

    it("should include year when crossing year boundaries forward", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-11-15"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentMonth+2",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("January 2025");
      expect(result?.dataValue).toBe("2025-01-01T00:00:00.000Z");
    });

    it("should include year when crossing year boundaries backward", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-02-15"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentMonth-3",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("November 2023");
      expect(result?.dataValue).toBe("2023-11-01T00:00:00.000Z");
    });
  });

  describe("currentYear template variable", () => {
    it("should return current year", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentYear",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("2024");
      expect(result?.dataValue).toBe(2024);
    });

    it("should support arithmetic operations", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18"),
      };

      const plusResult = TemplateVariableRegistry.evaluateExpression(
        "currentYear+5",
        context,
      );
      expect(plusResult?.displayValue).toBe("2029");
      expect(plusResult?.dataValue).toBe(2029);

      const minusResult = TemplateVariableRegistry.evaluateExpression(
        "currentYear-10",
        context,
      );
      expect(minusResult?.displayValue).toBe("2014");
      expect(minusResult?.dataValue).toBe(2014);
    });
  });

  describe("currentDay template variable", () => {
    it("should return current day of month", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentDay",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("18");
      expect(result?.dataValue).toBe("2024-09-18T00:00:00.000Z");
    });

    it("should support day arithmetic", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentDay+10",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("September 28");
    });

    it("should handle month transitions", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-28"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentDay+5",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("October 3");
    });

    it("should include year when crossing year boundaries", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-12-30"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentDay+5",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("January 4, 2025");
    });
  });

  describe("today template variable", () => {
    it("should return todays date in ISO format", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18T14:30:00"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "today",
        context,
      );
      expect(result).not.toBeNull();
      expect(result?.displayValue).toBe("9/18/2024");
      expect(result?.dataValue).toBe("2024-09-18T00:00:00.000Z");
    });

    it("should not support arithmetic operations", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "today+1",
        context,
      );
      expect(result).toBeNull();
    });
  });

  describe("Invalid expressions", () => {
    it("should return null for non-existent variables", () => {
      const context: TemplateContext = {
        currentDate: new Date(),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "nonExistent",
        context,
      );
      expect(result).toBeNull();
    });

    it("should return null for variables that dont support arithmetic", () => {
      const context: TemplateContext = {
        currentDate: new Date(),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "today+5",
        context,
      );
      expect(result).toBeNull();
    });

    it("should return null for malformed expressions", () => {
      const context: TemplateContext = {
        currentDate: new Date(),
      };

      expect(
        TemplateVariableRegistry.evaluateExpression("currentMonth++3", context),
      ).toBeNull();
      expect(
        TemplateVariableRegistry.evaluateExpression("currentMonth+", context),
      ).toBeNull();
      expect(
        TemplateVariableRegistry.evaluateExpression("+3", context),
      ).toBeNull();
    });
  });

  describe("UTC handling", () => {
    it("should always use UTC midnight for data values", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-09-18T23:59:59.999Z"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentMonth",
        context,
      );
      expect(result?.dataValue).toBe("2024-09-01T00:00:00.000Z");
    });

    it("should handle UTC date boundaries correctly", () => {
      const context: TemplateContext = {
        currentDate: new Date("2024-01-01T00:00:00.000Z"),
      };

      const result = TemplateVariableRegistry.evaluateExpression(
        "currentMonth-1",
        context,
      );
      expect(result?.displayValue).toBe("December 2023");
      expect(result?.dataValue).toBe("2023-12-01T00:00:00.000Z");
    });
  });
});
