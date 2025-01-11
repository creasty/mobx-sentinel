import { BuildOptions, build } from "esbuild";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("./package.json").toString("utf8"));

const shared = {
  external: [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.peerDependencies ?? {})],
  bundle: true,
  minify: true,
  sourcemap: true,
  logLevel: "info",
} satisfies BuildOptions;

build({
  ...shared,
  entryPoints: ["src/index.ts"],
  format: "cjs",
  outfile: "dist/index.cjs.js",
  target: ["ES6"],
});

build({
  ...shared,
  entryPoints: ["src/index.ts"],
  format: "esm",
  outfile: "dist/index.esm.js",
  target: ["ES6"],
});

build({
  ...shared,
  entryPoints: ["src/extension.ts"],
  format: "cjs",
  outfile: "dist/extension.cjs.js",
  target: ["ES6"],
});

build({
  ...shared,
  entryPoints: ["src/extension.ts"],
  format: "esm",
  outfile: "dist/extension.esm.js",
  target: ["ES6"],
});
