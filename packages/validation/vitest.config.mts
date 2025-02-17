import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    typecheck: {
      enabled: true,
      include: ["**/src/**/*.test.ts", "**/test-stage3/**"],
    },
  },
});
