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
});
