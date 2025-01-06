import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";

const compat = new FlatCompat();

export default [
  js.configs.recommended,
  {
    files: ["./packages/core/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./packages/core/tsconfig.json",
      },
      globals: {
        test: "readonly",
        expect: "readonly",
        React: "readonly",
        global: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "prettier/prettier": "error",
      "@typescript-eslint/no-namespace": "off",
      "no-redeclare": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["./packages/react/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./packages/react/tsconfig.json",
      },
      globals: {
        test: "readonly",
        expect: "readonly",
        React: "readonly",
        global: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "prettier/prettier": "error",
      "@typescript-eslint/no-namespace": "off",
      "no-redeclare": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  ...compat.config({
    ignorePatterns: ["dist/", "coverage/"],
  }),
];
