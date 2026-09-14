import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Vitest 5 clears spies before each test. The annotation tests assert on calls that
    // decorators make while the class body is evaluated, which happens at import time.
    clearMocks: false,
    typecheck: {
      enabled: true,
      // Only files in the program of ./tsconfig.json get checked; any other matched file just passes. So
      // test-stage3 is not listed here: it needs stage-3 settings, and the `test` script runs tsc on
      // test-stage3/tsconfig.json for it.
      include: ["**/src/**/*.test.ts"],
    },
  },
});
