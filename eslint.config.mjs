// @ts-check

import js from "@eslint/js";
import ts from "typescript-eslint";
import configPrettier from "eslint-config-prettier";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginMobx from "eslint-plugin-mobx";

export default ts.config(
  js.configs.recommended,
  ts.configs.recommended,
  configPrettier,
  pluginMobx.flatConfigs.recommended,
  {
    rules: {
      "no-redeclare": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "mobx/exhaustive-make-observable": "off",
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
      react: pluginReact,
      // @ts-expect-error reactHooksPlugin has broken type?
      "react-hooks": pluginReactHooks,
    },
    // @ts-expect-error reactHooksPlugin has broken type?
    rules: {
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
    },
  },
  {
    ignores: ["**/dist/", "**/coverage/", "**/apps/"],
  }
);
