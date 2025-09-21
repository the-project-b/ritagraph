import {
  mergeValidationConfigs,
  shouldIgnorePath,
  applyTransformer,
  applyAddTransformers,
} from "./validation-config";

describe("Three-Layer Validation System", () => {
  describe("mergeValidationConfigs", () => {
    it("should handle Layer 1 (global) only", () => {
      const globalConfig = {
        ignorePaths: ["global.path"],
        transformers: { "field.a": "transformer-uppercase" },
        normalization: [],
      };

      const result = mergeValidationConfigs(globalConfig);

      expect(result.ignorePaths).toEqual(["global.path"]);
      expect(result.transformers).toEqual({
        "field.a": "transformer-uppercase",
      });
    });

    it("should override Layer 1 with Layer 2 (example)", () => {
      const globalConfig = {
        ignorePaths: ["global.path"],
        transformers: { "field.a": "transformer-uppercase" },
        normalization: [],
      };

      const exampleConfig = {
        ignorePaths: ["example.path"],
        transformers: { "field.b": "transformer-lowercase" },
        normalization: [],
      };

      const result = mergeValidationConfigs(globalConfig, exampleConfig);

      expect(result.ignorePaths).toEqual(["example.path"]);
      expect(result.transformers).toEqual({
        "field.b": "transformer-lowercase",
      });
    });

    it("should override Layer 2 with Layer 3 (proposal)", () => {
      const globalConfig = {
        ignorePaths: ["global.path"],
        transformers: { "field.a": "transformer-uppercase" },
        normalization: [],
      };

      const exampleConfig = {
        ignorePaths: ["example.path"],
        transformers: { "field.b": "transformer-lowercase" },
        normalization: [],
      };

      const proposalOverrides = {
        ignorePaths: ["proposal.path"],
        transformers: { "field.c": "transformer-trim" },
      };

      const result = mergeValidationConfigs(
        globalConfig,
        exampleConfig,
        proposalOverrides,
      );

      expect(result.ignorePaths).toEqual(["proposal.path"]);
      expect(result.transformers).toEqual({ "field.c": "transformer-trim" });
    });

    it("should handle empty objects as complete overrides", () => {
      const globalConfig = {
        ignorePaths: ["global.path"],
        transformers: { "field.a": "transformer-uppercase" },
        normalization: [],
      };

      const exampleConfig = {
        ignorePaths: [],
        transformers: {},
        normalization: [],
      };

      const result = mergeValidationConfigs(globalConfig, exampleConfig);

      expect(result.ignorePaths).toEqual([]);
      expect(result.transformers).toEqual({});
    });

    it("should handle partial overrides at Layer 3", () => {
      const globalConfig = {
        ignorePaths: ["global.path"],
        transformers: { "field.a": "transformer-uppercase" },
        normalization: [],
      };

      const exampleConfig = {
        ignorePaths: ["example.path"],
        transformers: { "field.b": "transformer-lowercase" },
        normalization: [],
      };

      const proposalOverrides = {
        ignorePaths: ["proposal.path"],
      };

      const result = mergeValidationConfigs(
        globalConfig,
        exampleConfig,
        proposalOverrides,
      );

      expect(result.ignorePaths).toEqual(["proposal.path"]);
      expect(result.transformers).toEqual({
        "field.b": "transformer-lowercase",
      });
    });

    it("should handle undefined values correctly", () => {
      const globalConfig = {
        ignorePaths: ["global.path"],
        transformers: { "field.a": "transformer-uppercase" },
        normalization: [],
      };

      const result = mergeValidationConfigs(globalConfig, undefined, undefined);

      expect(result).toEqual(globalConfig);
    });

    it("should prioritize proposal over example over global", () => {
      const globalConfig = {
        ignorePaths: ["path1", "path2", "path3"],
        transformers: {
          "field.a": "transformer-uppercase",
          "field.b": "transformer-uppercase",
          "field.c": "transformer-uppercase",
        },
        normalization: [],
      };

      const exampleConfig = {
        ignorePaths: ["path4", "path5"],
        transformers: {
          "field.b": "transformer-lowercase",
          "field.c": "transformer-lowercase",
        },
        normalization: [],
      };

      const proposalOverrides = {
        ignorePaths: ["path6"],
        transformers: { "field.c": "transformer-trim" },
      };

      const result = mergeValidationConfigs(
        globalConfig,
        exampleConfig,
        proposalOverrides,
      );

      expect(result.ignorePaths).toEqual(["path6"]);
      expect(result.transformers).toEqual({ "field.c": "transformer-trim" });
    });
  });

  describe("shouldIgnorePath", () => {
    it("should ignore exact paths", () => {
      const config = {
        ignorePaths: ["field.to.ignore", "another.path"],
        normalization: [],
      };

      expect(shouldIgnorePath("field.to.ignore", config)).toBe(true);
      expect(shouldIgnorePath("another.path", config)).toBe(true);
      expect(shouldIgnorePath("field.to.keep", config)).toBe(false);
    });

    it("should support wildcard patterns", () => {
      const config = {
        ignorePaths: ["metadata.*", "*.timestamp"],
        normalization: [],
      };

      expect(shouldIgnorePath("metadata.created", config)).toBe(true);
      expect(shouldIgnorePath("metadata.updated", config)).toBe(true);
      expect(shouldIgnorePath("created.timestamp", config)).toBe(true);
      expect(shouldIgnorePath("other.field", config)).toBe(false);
    });

    it("should handle undefined ignorePaths", () => {
      const config = {
        ignorePaths: undefined,
        normalization: [],
      };

      expect(shouldIgnorePath("any.path", config)).toBe(false);
    });

    it("should handle empty ignorePaths array", () => {
      const config = {
        ignorePaths: [],
        normalization: [],
      };

      expect(shouldIgnorePath("any.path", config)).toBe(false);
    });
  });

  describe("applyTransformer", () => {
    it("should apply transformer to value", () => {
      const config = {
        ignorePaths: [],
        transformers: {
          "field.name": "transformer-uppercase",
        },
        normalization: [],
      };

      const result = applyTransformer("hello", "field.name", config, false);

      expect(result.value).toBe("HELLO");
      expect(result.wasAdded).toBe(false);
    });

    it("should return original value for non-existent transformer", () => {
      const config = {
        ignorePaths: [],
        transformers: {},
        normalization: [],
      };

      const result = applyTransformer("hello", "field.name", config, false);

      expect(result.value).toBe("hello");
      expect(result.wasAdded).toBe(false);
    });

    it("should handle template-based transformers", () => {
      const config = {
        ignorePaths: [],
        transformers: {
          effectiveDate: "transformer-template-currentMonth+3",
        },
        normalization: [],
      };

      const result = applyTransformer(
        undefined,
        "effectiveDate",
        config,
        true,
        new Date("2024-09-18"),
      );

      expect(result.value).toBe("2024-12-01T00:00:00.000Z");
      expect(result.wasAdded).toBe(true);
    });

    it("should respect transformer strategies", () => {
      const config = {
        ignorePaths: [],
        transformers: {
          "field.trim": "transformer-trim",
        },
        normalization: [],
      };

      const result = applyTransformer(
        "  spaced  ",
        "field.trim",
        config,
        false,
      );

      expect(result.value).toBe("spaced");
      expect(result.wasAdded).toBe(false);
    });
  });

  describe("applyAddTransformers", () => {
    it("should add missing fields based on transformers", () => {
      const config = {
        ignorePaths: [],
        transformers: {
          effectiveDate: "transformer-today-utc",
        },
        normalization: [],
      };

      const proposals = [{ changeType: "change" }];
      const result = applyAddTransformers(proposals, config, true);

      expect(result[0]).toHaveProperty("effectiveDate");
      expect(result[0].effectiveDate).toMatch(
        /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/,
      );
    });

    it("should not override existing values", () => {
      const config = {
        ignorePaths: [],
        transformers: {
          name: "transformer-uppercase",
        },
        normalization: [],
      };

      const proposals = [{ name: "existing" }];
      const result = applyAddTransformers(proposals, config, true);

      expect(result[0].name).toBe("existing");
    });

    it("should respect proposal-level ignorePaths", () => {
      const config = {
        ignorePaths: [],
        transformers: {
          "field.ignored": "transformer-uppercase",
        },
        normalization: [],
      };

      const proposals = [
        {
          ignorePaths: ["field.ignored"],
        },
      ];

      const result = applyAddTransformers(proposals, config, true);

      expect(result[0]).not.toHaveProperty("field.ignored");
    });

    it("should handle conditional transformers with conditionTarget", () => {
      const config = {
        ignorePaths: [],
        transformers: {
          effectiveDate: "transformer-today-utc-for-change",
        },
        normalization: [],
      };

      const expectedProposals = [{}];
      const actualProposals = [{ changeType: "change" }];

      const result = applyAddTransformers(
        expectedProposals,
        config,
        true,
        actualProposals,
      );

      expect(result[0]).toHaveProperty("effectiveDate");
    });
  });

  describe("Full Three-Layer Integration", () => {
    it("should correctly apply all three layers in order", () => {
      const globalConfig = {
        ignorePaths: ["global.ignore"],
        transformers: {
          "field.a": "transformer-uppercase",
          "field.b": "transformer-uppercase",
        },
        normalization: [],
      };

      const exampleConfig = {
        ignorePaths: ["example.ignore"],
        transformers: {
          "field.b": "transformer-lowercase",
          "field.c": "transformer-trim",
        },
        normalization: [],
      };

      const proposalOverrides = {
        transformers: {
          "field.c": "transformer-template-currentMonth",
        },
      };

      const merged = mergeValidationConfigs(
        globalConfig,
        exampleConfig,
        proposalOverrides,
      );

      expect(merged.ignorePaths).toEqual(["example.ignore"]);
      expect(merged.transformers).toEqual({
        "field.c": "transformer-template-currentMonth",
      });

      const fieldCResult = applyTransformer(
        undefined,
        "field.c",
        merged,
        true,
        new Date("2024-09-18"),
      );
      expect(fieldCResult.value).toBe("2024-09-01T00:00:00.000Z");
    });

    it("should handle empty overrides at each layer", () => {
      const globalConfig = {
        ignorePaths: ["path1", "path2"],
        transformers: {
          field: "transformer-uppercase",
        },
        normalization: [],
      };

      const exampleWithEmpty = {
        ignorePaths: [],
        transformers: {},
        normalization: [],
      };

      const merged = mergeValidationConfigs(globalConfig, exampleWithEmpty);

      expect(merged.ignorePaths).toEqual([]);
      expect(merged.transformers).toEqual({});
      expect(shouldIgnorePath("path1", merged)).toBe(false);
    });

    it("should maintain layer independence", () => {
      const globalConfig = {
        ignorePaths: ["global.path"],
        transformers: { "global.field": "transformer-uppercase" },
        normalization: [],
      };

      const example1Config = {
        ignorePaths: ["example1.path"],
        transformers: { "example1.field": "transformer-lowercase" },
        normalization: [],
      };

      const example2Config = {
        ignorePaths: ["example2.path"],
        transformers: { "example2.field": "transformer-trim" },
        normalization: [],
      };

      const result1 = mergeValidationConfigs(globalConfig, example1Config);
      const result2 = mergeValidationConfigs(globalConfig, example2Config);

      expect(result1.ignorePaths).toEqual(["example1.path"]);
      expect(result2.ignorePaths).toEqual(["example2.path"]);
      expect(result1.transformers).not.toEqual(result2.transformers);
    });
  });
});
