// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import mermaid from "astro-mermaid";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import { flattenApiSidebar } from "./src/typedoc/flatten-sidebar.mjs";
import { conversionOptions, entryPoints } from "./src/typedoc/options.mjs";

const apiSidebarLabel = "API reference";

export default defineConfig({
  site: "https://mobx-sentinel.creasty.com",
  markdown: {
    // Typography would turn a rest parameter's `...` into `…` and quote marks in comments into curly ones, which would
    // then differ from the code they document.
    smartypants: false,
  },
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
            // The title of /apis/, the API reference's landing page. Unset, it is "Documentation", the name TypeDoc
            // gives the project it merges the packages into.
            name: apiSidebarLabel,
            // Writes a package's pages to `react/`, not `@mobx-sentinel/react/`. starlight-typedoc assumes a package's
            // directory is one path segment when it builds the sidebar for a module inside it, so under the scoped,
            // two-segment one, react's `extension` entry point got an empty group and StandardExtensions no entry.
            excludeScopesInPaths: true,
          },
        }),
        flattenApiSidebar(apiSidebarLabel),
        // Fails the build on a broken internal link or a missing #anchor, which is what keeps the guides, spread
        // across many pages, from rotting as they are edited.
        starlightLinksValidator({ errorOnInvalidHashes: true }),
        // Serves /llms.txt, which points language models to the pages' Markdown, gathered into /llms-full.txt (every
        // page), /llms-small.txt (the guides) and /_llms-txt/api-reference.txt (the API reference).
        starlightLlmsTxt({
          details: [
            "mobx-sentinel is three packages. Each builds on the one before it:",
            "",
            "- `@mobx-sentinel/core`: `Watcher` detects changes in models, `Validator` and `makeValidatable` validate them reactively, synchronously or asynchronously, and `@nested` tracks models inside models.",
            "- `@mobx-sentinel/form`: forms with asynchronous submission, nested and array forms, error reporting that shows errors when users are ready for them, and the API for creating bindings. It includes no bindings itself.",
            "- `@mobx-sentinel/react`: hooks, and standard bindings for the most common form elements.",
            "",
            "The library assumes class-based MobX models and extends them from the outside. Its annotations work with both legacy (`experimentalDecorators`) and standard decorators. It is in an early stage of development, and its interface may change without notice.",
            "",
            "The abridged documentation is the guides. The API reference is its own set, and the complete documentation has both.",
          ].join("\n"),
          customSets: [
            {
              label: "API reference",
              description: "the classes, functions and types of the three packages, generated from their source",
              paths: ["apis/**"],
            },
          ],
          optionalLinks: [
            {
              label: "GitHub repository",
              url: "https://github.com/creasty/mobx-sentinel",
              description: "source code, issues and milestones",
            },
            {
              label: "Example app",
              url: "https://github.com/creasty/mobx-sentinel/tree/main/apps/example",
              description: "a working invoice editor, which the Overview's code is condensed from",
            },
          ],
          // Pages are otherwise sorted by id, which puts the API reference, under apis/, before the guides. These
          // follow the sidebar's groups, but within a group pages stay sorted by id: the plugin cannot sort by
          // `sidebar.order`.
          promote: ["index", "docs", "docs/installation", "docs/core/**", "docs/form/**", "docs/react/**"],
          demote: ["apis/**"],
          // Leaves the API reference, which has a set of its own, out of the abridged documentation.
          exclude: ["apis/**"],
          // Each page's Markdown as written. Rendering it to HTML and converting that back doubles every blank line in a
          // code block and turns each heading's anchor into a "Section titled" link. The cost is that .mdx pages keep
          // their imports and component tags, and that `minify`, which works on the HTML, does nothing.
          rawContent: true,
        }),
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
