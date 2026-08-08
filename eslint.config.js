import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

/**
 * Lint rules enforcing the guidelines in docs/DEVELOPMENT.md:
 * small focused units (complexity/size caps), no dead or duplicated code,
 * and explicit handling of promises.
 */
export default tseslint.config(
  { ignores: ["dist/**", "release/**", "coverage/**", "node_modules/**"] },

  // renderer sources
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { project: ["./tsconfig.json"], tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",

      // correctness
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      eqeqeq: ["error", "smart"],
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // keep units small and readable (KISS / SRP)
      complexity: ["warn", 15],
      "max-depth": ["warn", 4],
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 120, skipBlankLines: true, skipComments: true }],
      "max-params": ["warn", 5],

      // no dead code (DRY)
      "no-unused-private-class-members": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // tests may be longer and use loose assertions
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**/*.{ts,mjs}"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },

  // electron main/preload are CommonJS running in node
  {
    files: ["electron/**/*.cjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.commonjs },
    },
    rules: {
      "no-console": "off",
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },

  // build/config scripts
  {
    files: ["*.config.{js,ts}", "tests/**/*.mjs"],
    languageOptions: { globals: globals.node },
  }
);
