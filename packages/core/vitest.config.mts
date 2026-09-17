import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // memory.test.ts forces garbage collection with `gc()`, which Node only exposes with this flag. Worker threads reject
    // the flag, so this needs a pool of child processes, like the default `forks`.
    execArgv: ["--expose-gc"],
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
    // Every test runs against both builds of MobX. Its production build mangles the internal names ending in `_`, so
    // code reading one of those by name works in development only, and only the tests against that build notice.
    projects: [
      {
        extends: true,
        test: {
          name: "mobx-development",
        },
      },
      {
        extends: true,
        test: {
          name: "mobx-production",
          // MobX has no `exports` map, so Node takes its `main` entry, which loads the production build under this
          // NODE_ENV. That is how servers get it, whereas browser bundles take `module`, a build that is not mangled.
          // mobx.test.ts checks that this still selects the mangled build.
          env: { NODE_ENV: "production" },
          // Types are the same on both builds, and already checked by the other project.
          typecheck: { enabled: false },
        },
      },
    ],
  },
});
