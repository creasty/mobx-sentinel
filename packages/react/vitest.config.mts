import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    typecheck: {
      enabled: true,
      include: ["**/src/**/*.test.ts", "**/src/**/*.test.tsx"],
    },
  },
});
