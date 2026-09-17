// Guards what plugin.mjs does to the API reference, so a TypeDoc or typedoc-plugin-markdown upgrade cannot quietly
// undo it. Run after `astro build`, which generates the markdown checked by the second half.
//
//   pnpm --filter site check:api

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as td from "typedoc";
import { conversionOptions, entryPoints } from "./options.mjs";
import { decoratorTagHtml, decoratorTags } from "./plugin.mjs";

const apisDir = fileURLToPath(new URL("../content/docs/apis", import.meta.url));
const apisIndexHtml = fileURLToPath(new URL("../../dist/apis/index.html", import.meta.url));

/** @type string[] */
const failures = [];

const withMerge = await convert({ merge: true });
const withoutMerge = await convert({ merge: false });

checkOnlyNamespacesRemoved();
checkNoExternalDeclarations();
checkNoNamespaceSharesAName();
checkLinksResolve();
checkDecoratorTagsUnchanged();
checkNoUnknownTags();

if (!existsSync(apisDir)) {
  failures.push(`${apisDir} does not exist; run \`astro build\` first`);
} else {
  const pages = readPages(apisDir);
  checkEveryCommentRendered(pages);
  checkEveryDecoratorTagRendered(pages);
  checkEveryPageInSidebar(pages);
}

if (failures.length > 0) {
  console.error(`${failures.length} API reference check(s) failed:\n`);
  for (const failure of failures) console.error(`- ${failure}\n`);
  process.exit(1);
}
console.log("API reference checks passed");

/**
 * @param {{ merge: boolean }} options
 */
async function convert({ merge }) {
  // plugin.mjs reads this when TypeDoc loads it, which happens again for each Application.
  if (merge) {
    delete process.env.NO_MERGE_PLUGIN;
  } else {
    process.env.NO_MERGE_PLUGIN = "1";
  }
  const app = await td.Application.bootstrapWithPlugins({ ...conversionOptions, entryPoints, logLevel: "Error" }, [
    new td.TypeDocReader(),
    new td.PackageJsonReader(),
    new td.TSConfigReader(),
  ]);
  const project = await app.convert();
  if (!project) throw new Error(`TypeDoc failed to convert the packages (merge: ${merge})`);
  return project;
}

/**
 * @param {td.ProjectReflection} project
 */
function declarations(project) {
  return Object.values(project.reflections).filter((r) => r instanceof td.DeclarationReflection);
}

/**
 * @param {td.Reflection} reflection
 */
function describe(reflection) {
  return `${td.ReflectionKind[reflection.kind]} ${reflection.getFullName()}`;
}

/**
 * The merge must remove the namespaces and nothing else: their members keep their full names, so a member lost along
 * the way would show up here too.
 */
function checkOnlyNamespacesRemoved() {
  const remaining = new Map();
  for (const key of declarations(withMerge).map(describe)) {
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const removed = [];
  for (const key of declarations(withoutMerge).map(describe)) {
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
    } else {
      removed.push(key);
    }
  }
  const added = [...remaining].flatMap(([key, count]) => Array(count).fill(key));

  const notNamespaces = removed.filter((key) => !key.startsWith("Namespace "));
  if (notNamespaces.length > 0) {
    failures.push(`The merge removed reflections other than namespaces:\n  ${notNamespaces.join("\n  ")}`);
  }
  if (added.length > 0) {
    failures.push(`The merge added reflections:\n  ${added.join("\n  ")}`);
  }
  if (removed.length === 0) {
    failures.push("The merge removed no namespaces; is plugin.mjs loaded?");
  }
}

/**
 * Nothing defined outside the repository gets documented, like the members ValidationError inherits from `Error`.
 */
function checkNoExternalDeclarations() {
  for (const reflection of declarations(withMerge)) {
    const external = reflection.sources?.find((source) => source.fullFileName.includes("/node_modules/"));
    if (external) {
      failures.push(`${describe(reflection)} is documented but defined in ${external.fullFileName}`);
    }
  }
}

/**
 * A namespace next to a same-named declaration is one the merge missed.
 */
function checkNoNamespaceSharesAName() {
  for (const container of [withMerge, ...declarations(withMerge)]) {
    const children = container.children ?? [];
    for (const namespace of children.filter((child) => child.kindOf(td.ReflectionKind.Namespace))) {
      const twin = children.find((child) => child !== namespace && child.name === namespace.name);
      if (twin) {
        failures.push(`${describe(namespace)} was not merged into ${describe(twin)}`);
      }
    }
  }
}

/**
 * Checked on the combined project, since each package is converted with link validation turned off.
 */
function checkLinksResolve() {
  for (const reflection of Object.values(withMerge.reflections)) {
    const { comment } = reflection;
    if (!comment) continue;
    const parts = [...comment.summary, ...comment.blockTags.flatMap((tag) => tag.content)];
    for (const part of parts) {
      if (part.kind === "inline-tag" && part.tag === "@link" && !part.target) {
        failures.push(`${describe(reflection)} links to \`${part.text}\`, which does not resolve`);
      }
    }
  }
}

function checkDecoratorTagsUnchanged() {
  /** @param {td.ProjectReflection} project */
  const count = (project) => declarations(project).filter((r) => decoratorTagsOf(r).length > 0).length;
  const [before, after] = [count(withoutMerge), count(withMerge)];
  if (before !== after) {
    failures.push(`The merge changed the number of decorator-tagged declarations from ${before} to ${after}`);
  }
}

/**
 * TypeDoc takes a tag it does not know for the start of a section, so a decorator a comment names without declaring it
 * in options.mjs, as in `Get the value from the model @computed`, renders as a "Computed" heading rather than a tag.
 */
function checkNoUnknownTags() {
  const known = new Set(td.OptionDefaults.blockTags);
  for (const reflection of Object.values(withMerge.reflections)) {
    for (const { tag } of reflection.comment?.blockTags ?? []) {
      if (!known.has(tag)) {
        failures.push(`The comment of ${describe(reflection)} has the unknown tag ${tag}`);
      }
    }
  }
}

/**
 * @param {Map<string, string>} pages
 */
function checkEveryCommentRendered(pages) {
  const markdown = normalize([...pages.values()].join("\n"));
  for (const reflection of Object.values(withMerge.reflections)) {
    const summary = reflection.comment?.summary;
    if (!summary) continue;
    // A link renders as its label, so compare against that rather than the `{@link}` source.
    const text = normalize(summary.map((part) => part.text).join(""));
    // Too short to identify a comment by; a match would prove nothing.
    if (text.length < 8) continue;
    if (!markdown.includes(text.slice(0, 60))) {
      failures.push(`The comment of ${describe(reflection)} is not rendered: "${text.slice(0, 60)}"`);
    }
  }
}

/**
 * Per page, so a tag missing from one page cannot hide behind one duplicated on another.
 *
 * @param {Map<string, string>} pages
 */
function checkEveryDecoratorTagRendered(pages) {
  const directories = new Map([
    [td.ReflectionKind.Class, "classes"],
    [td.ReflectionKind.Interface, "interfaces"],
    [td.ReflectionKind.Enum, "enums"],
    [td.ReflectionKind.TypeAlias, "type-aliases"],
    [td.ReflectionKind.Function, "functions"],
    [td.ReflectionKind.Variable, "variables"],
    [td.ReflectionKind.Namespace, "namespaces"],
  ]);
  const pageKinds = [...directories.keys()].reduce((kinds, kind) => kinds | kind);

  /** @type Map<string, Map<string, number>> */
  const expected = new Map();
  for (const reflection of declarations(withMerge)) {
    const tags = decoratorTagsOf(reflection);
    if (tags.length === 0) continue;

    // The page a member renders on. MergedMemberRouter gives a page only to a declaration directly in a module;
    // anything deeper, including what the merge moved into a class, renders on that declaration's page.
    let owner = reflection.parent;
    while (owner && !(owner.kindOf(pageKinds) && owner.parent?.kindOf(td.ReflectionKind.Module))) {
      owner = owner.parent;
    }
    if (!owner) continue;
    // A module is a directory named after it, without its package's scope (excludeScopesInPaths); a declaration
    // sits in a directory for its kind. Entry points like react's `extension` are modules inside the package's.
    const path = [];
    for (let ancestor = /** @type {td.Reflection | undefined} */ (owner); ancestor && !ancestor.isProject(); ) {
      path.unshift(
        ancestor.kindOf(td.ReflectionKind.Module)
          ? ancestor.name.replace(/^@[^/]+\//, "")
          : `${directories.get(ancestor.kind)}/${ancestor.name}`
      );
      ancestor = ancestor.parent;
    }
    const file = `${path.join("/")}.md`;

    const counts = expected.get(file) ?? new Map();
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    expected.set(file, counts);
  }

  for (const [file, counts] of expected) {
    const markdown = pages.get(file);
    if (markdown === undefined) {
      failures.push(`${file} was not generated, but members with decorator tags render there`);
      continue;
    }
    for (const [tag, want] of counts) {
      const got = markdown.split(decoratorTagHtml(tag)).length - 1;
      if (got !== want) {
        failures.push(`${file} renders ${got} \`${tag}\` tag(s), expected ${want}`);
      }
    }
  }
}

/**
 * Every declaration's page is linked from the sidebar. Built from starlight-typedoc's groups, the sidebar can drop a
 * page that exists, as it did StandardExtensions until the package directories lost their scope.
 *
 * @param {Map<string, string>} pages
 */
function checkEveryPageInSidebar(pages) {
  if (!existsSync(apisIndexHtml)) {
    failures.push(`${apisIndexHtml} does not exist; run \`astro build\` first`);
    return;
  }
  const html = readFileSync(apisIndexHtml, "utf8");
  const nav = html.slice(html.indexOf('class="sidebar'));
  const linked = new Set([...nav.slice(0, nav.indexOf("</nav>")).matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
  const kindDirectories = /(^|\/)(classes|interfaces|enums|type-aliases|functions|variables|namespaces)\//;
  for (const file of pages.keys()) {
    // Package and entry point pages, index.md, are reached from the package's page rather than listed.
    if (!kindDirectories.test(file)) continue;
    // Starlight's URL for the page. Its slugs lowercase each segment and drop punctuation, like a scope's `@`, which
    // is all it takes for these plain ASCII names.
    const slugs = file
      .replace(/\.md$/, "")
      .split("/")
      .map((segment) => segment.toLowerCase().replace(/[^\w-]/g, ""));
    const url = `/apis/${slugs.join("/")}/`;
    if (!linked.has(url)) failures.push(`${url} is generated but not in the sidebar`);
  }
}

/**
 * @param {td.Reflection} reflection
 */
function decoratorTagsOf(reflection) {
  return [...(reflection.comment?.modifierTags ?? [])].filter((tag) => decoratorTags.has(tag));
}

/**
 * Markdown file contents keyed by path relative to `dir`.
 *
 * @param {string} dir
 */
function readPages(dir) {
  /** @type Map<string, string> */
  const pages = new Map();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(entry.parentPath, entry.name);
    pages.set(path.slice(dir.length + 1), readFileSync(path, "utf8"));
  }
  return pages;
}

/**
 * Reduce markdown and comment text alike to plain words, so formatting does not decide a match.
 *
 * @param {string} text
 */
function normalize(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
