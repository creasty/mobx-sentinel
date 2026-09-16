// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import mermaid from "astro-mermaid";
import starlightLinksValidator from "starlight-links-validator";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import { flattenApiSidebar } from "./src/typedoc/flatten-sidebar.mjs";
import { conversionOptions, entryPoints } from "./src/typedoc/options.mjs";

const apiSidebarLabel = "API reference";

export default defineConfig({
  site: "https://mobx-sentinel.creasty.com",
  integrations: [
    // Renders ```mermaid blocks in the browser, loading mermaid only on pages that have one, and re-renders them when
    // the theme switches. It must come before starlight, whose code-block rendering would otherwise take them.
    mermaid(),
    starlight({
      title: "mobx-sentinel",
      description:
        "MobX library for non-intrusive class-based model enhancement. Change detection, reactive validation, and form integration without contamination.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/creasty/mobx-sentinel" }],
      customCss: ["./src/styles/custom.css"],
      plugins: [
        starlightTypeDoc({
          output: "apis",
          entryPoints,
          sidebar: { label: apiSidebarLabel, collapsed: true },
          typeDoc: {
            ...conversionOptions,
            // Defined by plugin.mjs: the default router, changed to render merged members on their new parent's page.
            router: "merged-member",
            // starlight-typedoc deletes every nested README.md when `readme` is unset, and README.md is the default
            // name of each package's landing page, so the package links on /apis/ would all 404. index.md is kept, and
            // it is what Starlight serves at the directory's own URL.
            entryFileName: "index.md",
            // Writes a package's pages to `react/`, not `@mobx-sentinel/react/`. starlight-typedoc assumes a package's
            // directory is one path segment when it builds the sidebar for a module inside it, so under the scoped,
            // two-segment one, react's `extension` entry point got an empty group and StandardExtensions no entry.
            excludeScopesInPaths: true,
          },
        }),
        flattenApiSidebar(apiSidebarLabel),
        // Fails the build on a broken internal link or a missing #anchor, which is what keeps the guides, split from
        // four READMEs across many pages, from rotting as they are edited.
        starlightLinksValidator({ errorOnInvalidHashes: true }),
      ],
      sidebar: [
        { label: "Introduction", items: [{ slug: "docs" }, { slug: "docs/installation" }] },
        // Pages order themselves with `sidebar.order` in their frontmatter.
        { label: "Core", items: [{ autogenerate: { directory: "docs/core" } }] },
        { label: "Form", items: [{ autogenerate: { directory: "docs/form" } }] },
        { label: "React", items: [{ autogenerate: { directory: "docs/react" } }] },
        {
          label: "About",
          items: [
            { slug: "docs/architecture" },
            { slug: "docs/alternatives" },
            { label: "Milestones", link: "https://github.com/creasty/mobx-sentinel/milestones" },
          ],
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
