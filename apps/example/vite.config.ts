/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The `@/*` path in tsconfig.json, which Vite 7 does not read by itself.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    typecheck: {
      enabled: true,
      include: ["**/src/**/*.test.tsx"],
    },
    server: {
      deps: {
        // The packages are linked from the workspace rather than installed, so Vitest would transform their builds like
        // the app's own source. A `require` inside one of those CJS builds then goes to Node, which loads a second copy
        // of core that the app's imports do not share. Leaving the builds to Node, as Vitest does with any installed
        // dependency, loads a single copy of each package.
        external: [/\/node_modules\//, /\/packages\/(core|form|react)\/dist\//],
      },
    },
  },
});
