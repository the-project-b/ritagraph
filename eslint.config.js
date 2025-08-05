import js from "@eslint/js";
import typescript from "typescript-eslint";
import prettierPlugin from "eslint-plugin-prettier";
import unusedImportsPlugin from "eslint-plugin-unused-imports";

export default typescript.config(
  {
    // Global ignores
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/generated/**",
      "**/*.config.js",
      "**/*.config.ts",
      "**/codegen.ts",
    ],
  },

  // Base JavaScript rules
  js.configs.recommended,

  // TypeScript rules
  ...typescript.configs.recommended,

  // Custom rules for all files
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: {
      prettier: prettierPlugin,
      "unused-imports": unusedImportsPlugin,
    },
    rules: {
      // Prettier integration
      "prettier/prettier": "error",

      // Unused imports
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // TypeScript specific rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // General best practices
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",
      "prefer-arrow-callback": "error",

      // Import ordering (similar to Airbnb's rules)
      /*
      "sort-imports": [
        "error",
        {
          //ignoreCase: false,
          //ignoreDeclarationSort: true,
          //ignoreMemberSort: false,
          //memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single']
        },
      ],
      */
    },
  },
);
