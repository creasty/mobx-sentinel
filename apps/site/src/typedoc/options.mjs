import { fileURLToPath } from "node:url";

const fromRoot = (/** @type {string} */ path) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

/**
 * The packages to document. Each one's own typedoc.json (extending typedoc.base.json) names its entry points.
 */
export const entryPoints = [fromRoot("packages/core"), fromRoot("packages/form"), fromRoot("packages/react")];

/**
 * TypeDoc options that decide what gets converted, shared by the site build and check-api.mjs so the check
 * exercises exactly what the site renders. Options that only affect rendering stay in astro.config.mjs.
 *
 * @type {import("typedoc").TypeDocOptions}
 */
export const conversionOptions = {
  entryPointStrategy: "packages",
  // Merges each namespace into its same-named class/interface/type alias, and tags MobX-decorated members.
  // Absolute, because TypeDoc resolves plugin paths against the cwd, which differs under `pnpm --filter`.
  plugin: [fileURLToPath(new URL("./plugin.mjs", import.meta.url))],
  // `readme` is not a root-level option under the packages strategy, so the root default never reaches the
  // per-package conversions; without this, each package README becomes its API landing page.
  packageOptions: { readme: "none" },
};
