import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // memory.test.ts forces garbage collection with `gc()`, which Node only exposes with this flag. Worker threads reject
    // the flag, so this needs a pool of child processes, like the default `forks`.
    execArgv: ["--expose-gc"],
    typecheck: {
      enabled: true,
      include: ["**/src/**/*.test.ts"],
    },
    coverage: {
      // Coverage leaves out the test files on its own, but not the modules they share.
      exclude: ["src/bindingFixtures.ts"],
    },
  },
});
