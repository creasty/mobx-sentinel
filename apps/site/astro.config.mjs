// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import { conversionOptions, entryPoints } from "./src/typedoc/options.mjs";

export default defineConfig({
  site: "https://mobx-sentinel.creasty.com",
  integrations: [
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
          sidebar: { label: "API reference", collapsed: true },
          typeDoc: {
            ...conversionOptions,
            // Defined by plugin.mjs: the default router, fixed to nest merged members under their new parent.
            router: "merged-member",
            // starlight-typedoc deletes every nested README.md when `readme` is unset, and README.md is the default name
            // of each package's landing page, so the package links on /apis/ would all 404. index.md is kept, and it is
            // what Starlight serves at the directory's own URL.
            entryFileName: "index.md",
          },
        }),
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
