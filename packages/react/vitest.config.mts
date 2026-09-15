import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    // memory.test.tsx forces garbage collection with `gc()`, which Node only exposes with this flag. Worker threads
    // reject the flag, so this needs a pool of child processes, like the default `forks`.
    execArgv: ["--expose-gc"],
    typecheck: {
      enabled: true,
      include: ["**/src/**/*.test.ts", "**/src/**/*.test.tsx"],
    },
  },
});
