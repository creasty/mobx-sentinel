import { defineConfig } from "tsup";

export default defineConfig({
  dts: true,
  minify: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
});
