import { BuildOptions, build } from "esbuild";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("./package.json").toString("utf8"));

const shared: BuildOptions = {
  entryPoints: ["src/index.ts"],
  external: [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.peerDependencies ?? {})],
  bundle: true,
  minify: true,
  sourcemap: true,
  logLevel: "info",
};

build({
  ...shared,
  format: "cjs",
  outfile: "dist/index.cjs.js",
  target: ["ES6"],
});

build({
  ...shared,
  format: "esm",
  outfile: "dist/index.esm.js",
  target: ["ES6"],
});
