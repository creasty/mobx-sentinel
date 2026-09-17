import { fileURLToPath } from "node:url";
import { OptionDefaults } from "typedoc";

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
  // Under the packages strategy each package is converted with fresh options and only these applied, so a root-level
  // value like `readme: "none"` never reaches it.
  packageOptions: {
    // Otherwise each package's README becomes its API landing page.
    readme: "none",
    // Leave out members inherited from outside the repository, like those ValidationError gets from the `Error` of
    // TypeScript's lib and @types/node.
    excludeExternals: true,
    // Doc comments name the MobX decorator a config's function runs under, as in `Set the value to the model
    // @action`, and TypeDoc would take an unknown tag for the start of a section.
    modifierTags: [...OptionDefaults.modifierTags, "@action", "@computed"],
  },
};
