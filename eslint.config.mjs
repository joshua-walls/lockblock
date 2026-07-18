import tsparser from "@typescript-eslint/parser";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "eslint.config.mjs",
      "esbuild.config.mjs",
      "dist/**",
      "main.js",
      "node_modules/**",
      "package-lock.json",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  },
  {
    files: ["manifest.json", "tsconfig.json", "versions.json"],
    language: "json/json",
    plugins: {
      json,
    },
    rules: {
      "no-irregular-whitespace": "off",
      "obsidianmd/no-plugin-as-component": "off",
      "obsidianmd/no-unsupported-api": "off",
      "obsidianmd/no-view-references-in-plugin": "off",
      "obsidianmd/prefer-file-manager-trash-file": "off",
      "obsidianmd/prefer-instanceof": "off",
    },
  },
  {
    files: ["package.json"],
    rules: {
      "obsidianmd/no-plugin-as-component": "off",
      "obsidianmd/no-unsupported-api": "off",
      "obsidianmd/no-view-references-in-plugin": "off",
      "obsidianmd/prefer-file-manager-trash-file": "off",
      "obsidianmd/prefer-instanceof": "off",
    },
  },
]);
