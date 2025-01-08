// @ts-check

import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import ts from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const compat = new FlatCompat();

export default ts.config(
  js.configs.recommended,
  ts.configs.recommended,
  prettierConfig,
  {
    rules: {
      "no-redeclare": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["./packages/core/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./packages/core/tsconfig.json",
      },
    },
    rules: {},
  },
  {
    files: ["./packages/react/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./packages/react/tsconfig.json",
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: reactPlugin,
      // @ts-expect-error reactHooksPlugin has broken type?
      "react-hooks": reactHooksPlugin,
    },
    // @ts-expect-error reactHooksPlugin has broken type?
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },
  ...compat.config({
    ignorePatterns: ["dist/", "coverage/"],
  })
);
