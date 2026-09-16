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

/** @type string[] */
const failures = [];

const withMerge = await convert({ merge: true });
const withoutMerge = await convert({ merge: false });

checkOnlyNamespacesRemoved();
checkNoExternalDeclarations();
checkNoNamespaceSharesAName();
checkLinksResolve();
checkDecoratorTagsUnchanged();

if (!existsSync(apisDir)) {
  failures.push(`${apisDir} does not exist; run \`astro build\` first`);
} else {
  const pages = readPages(apisDir);
  checkEveryCommentRendered(pages);
  checkEveryDecoratorTagRendered(pages);
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
    const path = [];
    let ancestor = /** @type {td.Reflection | undefined} */ (owner);
    for (; ancestor && !ancestor.kindOf(td.ReflectionKind.Module); ancestor = ancestor.parent) {
      path.unshift(`${directories.get(ancestor.kind)}/${ancestor.name}`);
    }
    if (!ancestor) continue;
    const file = `${ancestor.name}/${path.join("/")}.md`;

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
