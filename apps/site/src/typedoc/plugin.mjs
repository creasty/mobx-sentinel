import * as td from "typedoc";
import { MemberRouter } from "typedoc-plugin-markdown";

const ts = td.TypeScript;

/**
 * @param {td.Application} app
 */
export function load(app) {
  // Before the merge below, and after CommentPlugin (priority 0) so hidden reflections are already gone.
  app.converter.on(td.Converter.EVENT_RESOLVE_BEGIN, promoteIndexModule, -50);
  // Skippable so check-api.mjs can convert once with the merge and once without, and diff the two.
  if (!process.env.NO_MERGE_PLUGIN) {
    // After CommentPlugin (priority 0) has removed @ignore/@internal reflections, so they are never resurrected,
    // and before GroupPlugin (RESOLVE_END) builds groups, so they are computed over the merged tree.
    // typedoc-plugin-markdown only renders a type alias's children when that type alias has groups.
    app.converter.on(td.Converter.EVENT_RESOLVE_BEGIN, mergeDeclarationMerges, -100);
  }
  app.converter.on(td.Converter.EVENT_CREATE_DECLARATION, addDecoratorInfo);
  // After CommentPlugin (priority 0) has settled which reflection each comment belongs to.
  app.converter.on(td.Converter.EVENT_RESOLVE_BEGIN, copyDecoratorTagsToSignatures, -50);
  app.renderer.defineRouter("merged-member", MergedMemberRouter);
  app.renderer.on(td.PageEvent.END, writeDecoratorTags);
  app.renderer.on(td.PageEvent.END, dropEmptyTypeParameterSections);
  // typedoc-plugin-markdown creates its hooks when it loads, and starlight-typedoc always loads it last.
  app.on(td.Application.EVENT_BOOTSTRAP_END, () => {
    // Absent when only converting, as check-api.mjs does.
    app.renderer.markdownHooks?.on("page.begin", extendPartials);
    app.renderer.markdownHooks?.on("page.begin", renderTypesFaithfully);
  });
}

/**
 * Change how typedoc-plugin-markdown renders a page by extending its partials before anything on the page renders.
 * Extending the partials rather than appending to the page is what also covers members rendered on another
 * declaration's page, like `InputBinding.Config` on `InputBinding`'s.
 *
 * Two render what the theme leaves out but TypeDoc's HTML theme shows (if a later typedoc-plugin-markdown renders
 * them itself, they will show twice):
 * - Properties of a function built with `Object.assign`, such as `nested.hoist` and `watch.ref`. The theme renders only
 *   a function's signatures.
 * - The members of a union inside an intersection, as in `InputBinding.Config`
 *   (`object & { ...shared } & ({ valueAs?: "string" } | { valueAs: "number" } | ...)`). The theme expands the
 *   object parts of an intersection and the members of a top-level union, but not a union nested in an intersection,
 *   so each variant's `getter`, `setter` and `valueAs` would lose their descriptions and decorator tags.
 *
 * The rest tidy the page:
 * - The heading per kind (Classes, Functions; Constructors, Accessors, Methods) goes, keeping the order the theme would
 *   group them in. A package lists its exports as one list. A class, interface, type alias or namespace lists its
 *   members by how they are used (see memberSections): its Types, its Constructor, its Static Members and its other
 *   Members, their own subsections a level below, so the table of contents still has one entry per member.
 * - Index signatures are the first of those members, under Indexable, rather than a section of their own.
 * - A type parameter that says nothing but its name, having no constraint, default or description, is left out, and
 *   so is a Type Parameters section left empty (see dropEmptyTypeParameterSections).
 *
 * @param {import("typedoc-plugin-markdown").MarkdownThemeContext} context
 */
function extendPartials(context) {
  const { partials } = context;
  const { member, declaration, body, memberWithGroups, typeParametersList } = partialsToExtend(partials, [
    ...["member", "declaration", "body", "memberWithGroups", "typeParametersList"],
    "indexSignature",
  ]);
  // A stand-in for each declaration memberWithGroups renders without its index signatures, mapped to the declaration.
  /** @type {WeakMap<object, td.DeclarationReflection>} */
  const withoutIndexSignatures = new WeakMap();

  partials.member = (model, options) => {
    // The theme renders only packages, classes, interfaces, enums and type aliases with members this way. A namespace
    // on another's page would otherwise go through the declaration partial and lose its members.
    if (model.kindOf(td.ReflectionKind.Namespace)) {
      return partials.memberWithGroups(model, { headingLevel: options.headingLevel + 1 });
    }
    const md = member(model, options);
    if (!model.kindOf(td.ReflectionKind.Function) || !model.children?.length) return md;
    return [
      md,
      `${"#".repeat(options.headingLevel + 1)} ${td.ReflectionKind.pluralString(td.ReflectionKind.Property)}`,
      ...model.children.map((child) => partials.memberContainer(child, { headingLevel: options.headingLevel + 2 })),
    ].join("\n\n");
  };

  partials.declaration = (model, options = { headingLevel: 2 }) => {
    const md = declaration(model, options);
    if (!(model.type instanceof td.IntersectionType)) return md;
    const unions = model.type.types.filter(
      (type) => type instanceof td.UnionType && type.types.some((variant) => variant instanceof td.ReflectionType)
    );
    return [
      md,
      ...unions.flatMap((union) => [
        `${"#".repeat(options.headingLevel)} ${td.i18n.theme_union_members()}`,
        // The partial reads the union from `model.type`; everything else it needs comes from the model itself.
        partials.typeDeclarationUnionContainer(Object.create(model, { type: { value: union } }), options),
      ]),
    ].join("\n\n");
  };

  partials.memberWithGroups = (model, options) => {
    if (!model.indexSignatures?.length || model.categories?.length) return memberWithGroups(model, options);
    // The theme renders the index signatures before the body; the body renders them among the members instead.
    const standIn = Object.create(model, { indexSignatures: { value: undefined } });
    withoutIndexSignatures.set(standIn, model);
    return memberWithGroups(standIn, options);
  };

  partials.typeParametersList = (model, options) => {
    const informative = model.filter(
      (typeParameter) => typeParameter.type || typeParameter.default || typeParameter.comment
    );
    return informative.length > 0 ? typeParametersList(informative, options) : noInformativeTypeParameters;
  };

  partials.body = (rendered, options) => {
    const model = withoutIndexSignatures.get(rendered) ?? rendered;
    const indexSignatures = withoutIndexSignatures.has(rendered) ? (model.indexSignatures ?? []) : [];
    // The root page lists the packages under its own heading, with their versions. Categories are left alone too.
    if (model.kindOf(td.ReflectionKind.Project) || model.categories?.length) return body(model, options);
    const children = model.groups?.flatMap((group) => group.children) ?? [];
    if (children.length === 0 && indexSignatures.length === 0) return body(model, options);
    const withPages = children.filter((child) => context.router.hasOwnDocument(child));
    // A package links to its exports' pages. The theme's hideGroupHeadings option does not help: it still heads a
    // list of links with its kind, and drops headings only between members rendered on the page.
    if (withPages.length > 0 && withPages.length === children.length) return partials.groupIndex({ children });
    if (withPages.length > 0) return body(model, options);

    const members = children.filter((child) => child.isDeclaration());
    // A namespace rendered on another declaration's page is already under its own heading.
    if (model !== context.page.model) return partials.members(members, { headingLevel: options.headingLevel });
    const indexable = [
      `${"#".repeat(options.headingLevel + 1)} ${td.i18n.theme_indexable()}`,
      ...indexSignatures.map((signature) => {
        const md = partials.indexSignature(signature, { headingLevel: options.headingLevel + 2 });
        return context.options.getValue("useCodeBlocks") ? md : `> ${md}`;
      }),
    ].join("\n\n");
    const section = (/** @type {string} */ title, /** @type {string[]} */ entries) =>
      entries.length > 0
        ? [`${"#".repeat(options.headingLevel)} ${title}`, entries.join("\n\n***\n\n")].join("\n\n")
        : "";
    const listed = (/** @type {td.DeclarationReflection[]} */ list) =>
      list.length > 0 ? [partials.members(list, { headingLevel: options.headingLevel + 1 })] : [];
    const { types, constructors, statics, rest } = memberSections(members);
    return [
      section("Types", listed(types)),
      // Under no section: the theme heads each constructor signature with a Constructor heading of its own.
      constructors.length > 0 ? partials.members(constructors, { headingLevel: options.headingLevel }) : "",
      section("Static Members", listed(statics)),
      section("Members", [...(indexSignatures.length > 0 ? [indexable] : []), ...listed(rest)]),
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  // A hook's return value is inserted into the page; this one only extends the partials.
  return "";
}

/**
 * Render types as TypeScript reads them, and as TypeDoc's HTML theme did, where typedoc-plugin-markdown would print a
 * different type or leave part of one out:
 * - A function type keeps `new` and its parameters' types, as in `new (field: FormField) => FormBinding`. The theme
 *   prints only the parameter names, and nothing else on the page names a callback's parameter types.
 * - An intersection parenthesizes the unions in it: `object & (A | B)`, not `object & A | B`.
 * - A named tuple member keeps its name, as in `[keyPath: KeyPath, error: ValidationError]`.
 * - A type predicate and a template literal type link the types in them, rather than print the whole as code.
 * - A reference to a type declared inside another names the declarations it is in, as in `InputBinding.Config`, where
 *   the theme prints `Config`.
 * - An interface that extends several lists each one, where the theme joins them with dots, as if into one name.
 * - An interface does not get the `()` the theme puts after the name of anything with call signatures.
 * - "Defined in" lists every declaration of a merged name, not only the first.
 *
 * @param {import("typedoc-plugin-markdown").MarkdownThemeContext} context
 */
function renderTypesFaithfully(context) {
  const { partials, helpers } = context;
  const { functionType, someType, referenceType, memberTitle, sources } = partialsToExtend(partials, [
    ...["functionType", "someType", "referenceType", "memberTitle", "sources"],
    ...["intersectionType", "namedTupleType", "hierarchy"],
  ]);

  partials.functionType = (model, options) =>
    model
      .map((signature) => {
        const md = functionType([signature], { ...options, forceParameterType: true });
        return signature.kindOf(td.ReflectionKind.ConstructorSignature) ? `new ${md}` : md;
      })
      .join("; ");

  partials.intersectionType = (model) =>
    model.types
      .map((type) => {
        const md = partials.someType(type);
        return type.needsParenthesis(td.TypeContext.intersectionElement) ? `(${md})` : md;
      })
      .join(" & ");

  partials.namedTupleType = (model) =>
    `\`${model.name}${model.isOptional ? "?" : ""}\`: ${partials.someType(model.element)}`;

  partials.someType = (model, options) => {
    if (model instanceof td.PredicateType) {
      const subject = `${model.asserts ? "*asserts* " : ""}\`${model.name}\``;
      return model.targetType ? `${subject} *is* ${partials.someType(model.targetType)}` : subject;
    }
    if (model instanceof td.TemplateLiteralType) {
      const spans = model.tail.map(([type, text]) => `$\\{${partials.someType(type)}\\}${escapeMarkdown(text)}`);
      return `\\\`${escapeMarkdown(model.head)}${spans.join("")}\\\``;
    }
    return someType(model, options);
  };

  partials.referenceType = (model) => {
    const md = referenceType(model);
    const target = model.reflection;
    if (!target || target.kindOf(td.ReflectionKind.TypeParameter)) return md;
    const names = [target.name];
    for (let parent = target.parent; parent && !parent.kindOf(ModuleOrProject); parent = parent.parent) {
      names.unshift(parent.name);
    }
    // The theme's own rendering starts with the name, linked or not.
    return md.replace(`\`${target.name}\``, `\`${names.join(".")}\``);
  };

  partials.hierarchy = (model, options) => {
    const md = [];
    const heading = (/** @type {string} */ text) => `${"#".repeat(Math.min(options.headingLevel, 6))} ${text}`;
    const list = (/** @type {td.SomeType[]} */ types, /** @type {boolean} */ isTarget) =>
      types.map((type) => `- ${helpers.getHierarchyType(type, { isTarget })}`).join("\n");
    for (let level = model; level.next; level = level.next) {
      if (!level.isTarget && level.types.length) {
        md.push(heading(td.i18n.theme_extends()), list(level.types, false));
      } else {
        md.push(heading(td.i18n.theme_extended_by()), list(level.next.types, level.next.isTarget ?? false));
      }
      if (!level.next.next) break;
    }
    return md.join("\n\n");
  };

  partials.memberTitle = (model) => {
    const md = memberTitle(model);
    return model.kindOf(td.ReflectionKind.Interface) ? md.replace("()", "") : md;
  };

  partials.sources = (model, options) =>
    [
      sources(model, options),
      ...(model.sources ?? []).slice(1).map((source) => {
        const location = `${escapeMarkdown(source.fileName)}:${source.line}`;
        return source.url ? `[${location}](${source.url})` : location;
      }),
    ].join(", ");

  return "";
}

const ModuleOrProject = td.ReflectionKind.Module | td.ReflectionKind.Project;

const TypeKinds =
  td.ReflectionKind.Class |
  td.ReflectionKind.Interface |
  td.ReflectionKind.TypeAlias |
  td.ReflectionKind.Enum |
  td.ReflectionKind.Namespace;

/**
 * Splits a page's members by how they are used, keeping their order within each:
 * - types: those declared in the namespace merged into a class, interface or type alias, as `Validator.AsyncHandler`.
 * - constructors: a class's, which create an instance rather than belong to one.
 * - statics: those used without an instance, whether a class's own statics, as `Validator.get()`, or the functions and
 *   variables of its namespace, as `KeyPath.build()`.
 * - rest: which on a class are its instance members.
 *
 * @param {td.DeclarationReflection[]} members
 */
function memberSections(members) {
  const isStatic = (/** @type {td.DeclarationReflection} */ member) =>
    member.flags.isStatic || member.kindOf(td.ReflectionKind.Function | td.ReflectionKind.Variable);
  const others = members.filter((member) => !member.kindOf(TypeKinds | td.ReflectionKind.Constructor));
  return {
    types: members.filter((member) => member.kindOf(TypeKinds)),
    constructors: members.filter((member) => member.kindOf(td.ReflectionKind.Constructor)),
    statics: others.filter(isStatic),
    rest: others.filter((member) => !isStatic(member)),
  };
}

/**
 * The partials a hook replaces, failing the build if typedoc-plugin-markdown has renamed one, as the replacement would
 * otherwise quietly never run.
 *
 * @param {import("typedoc-plugin-markdown").MarkdownThemeContext["partials"]} partials
 * @param {string[]} names
 * @returns {any}
 */
function partialsToExtend(partials, names) {
  const missing = names.filter((name) => typeof (/** @type {any} */ (partials)[name]) !== "function");
  if (missing.length) throw new Error(`typedoc-plugin-markdown has no ${missing.join(", ")} partial to extend`);
  return { ...partials };
}

/**
 * Escapes what typedoc-plugin-markdown escapes in text it writes into a page.
 *
 * @param {string} text
 */
function escapeMarkdown(text) {
  return text.replace(/[<>{}_`|[\]*]/g, "\\$&");
}

/**
 * typedoc-plugin-markdown's default router, changed to give pages only to what a package's entry points export. A
 * merged namespace's members, and a namespace's own, render on the page of the declaration they belong to.
 *
 * MemberRouter gives a page to every class, interface, type alias, function, variable and namespace. Before the merge,
 * none of those sat inside a class, interface or type alias, so it never had to place such a page, and it cannot: it
 * would put `KeyPath`'s functions at the output root, as `KeyPath/functions/`. Giving them anchors on the parent's page
 * instead also makes the theme render them in full there, the way it renders properties and methods, since it lists a
 * group as links only when every member of the group has a page of its own. Doing the same inside a namespace keeps its
 * members out of per-kind directories, which the sidebar would show as `type-aliases` and `namespaces` groups.
 */
class MergedMemberRouter extends MemberRouter {
  /**
   * @param {td.Reflection} reflection
   * @param {td.PageDefinition[]} outPages
   */
  buildChildPages(reflection, outPages) {
    const { parent } = reflection;
    if (parent instanceof td.DeclarationReflection && !parent.kindOf(td.ReflectionKind.Module)) {
      this.buildAnchors(reflection, parent);
      return;
    }
    super.buildChildPages(reflection, outPages);
  }

  /**
   * A namespace gets a page like a class's, `namespaces/Name.md`, rather than a directory for its members' pages with
   * its own as the index, which would appear in the sidebar as a group holding one page.
   *
   * @param {td.Reflection} reflection
   */
  getIdealBaseName(reflection) {
    if (!reflection.kindOf(td.ReflectionKind.Namespace)) return super.getIdealBaseName(reflection);
    return `${this.getReflectionDirectory(reflection)}/${this.getReflectionFileName(reflection)}`.replace(/ /g, "-");
  }
}

/**
 * Fold a package's `index` module into the package itself.
 *
 * A package with one entry point has its exports directly on the package; one with several (react: `index.ts` and
 * `extension.ts`) gets a module per entry point instead. The one named `index` can never have a URL of its own, since
 * Astro drops `index` path segments, and it is the package's main export anyway, which is what `import ... from
 * "@mobx-sentinel/react"` resolves to. This is the same merge TypeDoc performs for `@mergeModuleWith <project>`.
 *
 * Runs once per package, while each is converted as its own project.
 *
 * @param {td.Context} context
 */
function promoteIndexModule(context) {
  const { project } = context;
  const modules = project.children?.filter((child) => child.kindOf(td.ReflectionKind.Module)) ?? [];
  const index = modules.find((module) => module.name === "index");
  if (modules.length < 2 || !index) return;
  project.mergeReflections(index, project);
}

/**
 * Survivor preference when a merged symbol has more than one non-namespace declaration.
 * Every merge in this repository has exactly one; the order only keeps the result deterministic.
 */
const survivorKinds = [
  td.ReflectionKind.Class,
  td.ReflectionKind.Interface,
  td.ReflectionKind.Enum,
  td.ReflectionKind.TypeAlias,
  td.ReflectionKind.Function,
  td.ReflectionKind.Variable,
];

/**
 * Fold every namespace into the class, interface or type alias it is declaration-merged with, so the two render as
 * one page instead of two.
 *
 * The namespace is always the one removed: in type position, TypeDoc resolves a reference to a merged symbol by
 * preferring the class/interface/type-alias reflection, so removing that side would strand every signature that
 * mentions it.
 *
 * @param {td.Context} context
 */
function mergeDeclarationMerges(context) {
  visit(context, context.project);
}

/**
 * @param {td.Context} context
 * @param {td.ContainerReflection} container
 */
function visit(context, container) {
  // Depth-first, so a nested namespace merges before its container is merged away.
  for (const child of container.children?.slice() ?? []) {
    if (child.children) visit(context, child);
  }
  mergeChildrenOf(context, container);
}

/**
 * @param {td.Context} context
 * @param {td.ContainerReflection} container
 */
function mergeChildrenOf(context, container) {
  /** @type Map<unknown, td.DeclarationReflection[]> */
  const buckets = new Map();
  for (const child of container.children ?? []) {
    // A declaration merge is one ts.Symbol with several declarations. The name is only a fallback for reflections
    // TypeDoc synthesized without a symbol.
    const key = context.getSymbolFromReflection(child) ?? child.name;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(child);
    } else {
      buckets.set(key, [child]);
    }
  }

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    // Only merges that involve exactly one namespace. KeyPath.Self is a type alias and a const sharing a symbol,
    // with no namespace in it; merging a type and a value would mean reconciling two populated `type` fields.
    const namespaces = bucket.filter((r) => r.kindOf(td.ReflectionKind.Namespace));
    if (namespaces.length !== 1) continue;
    const [namespace] = namespaces;

    const candidates = bucket.filter((r) => r !== namespace);
    const survivor = survivorKinds.map((kind) => candidates.find((r) => r.kindOf(kind))).find(Boolean);
    if (!survivor) continue;
    if (candidates.length > 1) {
      context.logger.verbose(
        `Merging namespace ${namespace.getFullName()} into one of ${candidates.length} declarations`
      );
    }

    if (!survivor.comment && namespace.comment) {
      survivor.comment = namespace.comment;
    }
    // A reflection's sources are its symbol's declarations, so the survivor usually lists the namespace's already.
    const location = (/** @type {td.SourceReference} */ source) => `${source.fullFileName}:${source.line}`;
    const known = new Set(survivor.sources?.map(location));
    const added = namespace.sources?.filter((source) => !known.has(location(source))) ?? [];
    if (added.length) {
      survivor.sources = [...(survivor.sources ?? []), ...added];
    }
    // TypeDoc's own primitive, also used by its @mergeModuleWith support. It reparents the children and keeps the
    // symbol and reference maps consistent; moving children by hand would leave ReferenceType targets dangling.
    context.project.mergeReflections(namespace, survivor);
  }
}

export const decoratorTags = new Set(["@action", "@action.bound", "@computed"]);

/**
 * How a decorator tag appears on a rendered page: the way the source spells it, in a span for custom.css.
 *
 * @param {string} tag
 */
export const decoratorTagHtml = (tag) => `<span class="api-tag">${tag}</span>`;

/**
 * Each decorator tag as typedoc-plugin-markdown writes it, which renders a modifier tag as **`Action`**, uppercasing the
 * first letter, mapped to its replacement.
 */
const renderedDecoratorTags = new Map(
  [...decoratorTags].map((tag) => [`**\`${tag[1].toUpperCase()}${tag.slice(2)}\`**`, decoratorTagHtml(tag)])
);

/**
 * What the type parameter list renders when every type parameter it is given says nothing but its name.
 */
const noInformativeTypeParameters = "<!-- no informative type parameters -->";

/**
 * Remove a Type Parameters section that has none left to list. The heading comes from the partial that lists them,
 * as memberWithGroups, declaration and signature each render their own, so it goes once the page is complete.
 *
 * @param {td.PageEvent} page
 */
function dropEmptyTypeParameterSections(page) {
  if (!page.contents) return;
  const heading = td.ReflectionKind.pluralString(td.ReflectionKind.TypeParameter);
  page.contents = page.contents.replace(
    new RegExp(`\\n\\n#{1,6} ${heading}\\n\\n${noInformativeTypeParameters}`, "g"),
    ""
  );
  if (page.contents.includes(noInformativeTypeParameters)) {
    throw new Error(`${page.url} lists no type parameters under a heading other than "${heading}"`);
  }
}

/**
 * Rewrite the decorator tags on a rendered page. Done here rather than in Astro's Markdown pipeline, whose rehype
 * plugins only run on the unified processor Astro 7 no longer uses by default.
 *
 * @param {td.PageEvent} page
 */
function writeDecoratorTags(page) {
  if (!page.contents) return;
  for (const [markdown, html] of renderedDecoratorTags) {
    page.contents = page.contents.replaceAll(markdown, html);
  }
}

/**
 * Put the decorator tags `addDecoratorInfo` added to a method onto its signatures too.
 *
 * A method's doc comment belongs to its signature, and typedoc-plugin-markdown renders a signature's comment, falling
 * back to the method's own only when the signature has none. So every documented `@action` method would lose its tag,
 * although TypeDoc's HTML theme shows it. Accessors and properties are unaffected.
 *
 * @param {td.Context} context
 */
function copyDecoratorTagsToSignatures(context) {
  for (const reflection of Object.values(context.project.reflections)) {
    if (!reflection.isDeclaration() || !reflection.signatures) continue;
    const tags = [...(reflection.comment?.modifierTags ?? [])].filter((tag) => decoratorTags.has(tag));
    if (tags.length === 0) continue;

    for (const signature of reflection.signatures) {
      // A lone undocumented signature already renders the method's comment, tags and all.
      if (!signature.comment && reflection.signatures.length === 1) continue;
      signature.comment ??= new td.Comment();
      for (const tag of tags) {
        signature.comment.modifierTags.add(tag);
      }
    }
  }
}

/**
 * @param {td.Context} context
 * @param {td.DeclarationReflection} decl
 *
 * @see https://github.com/TypeStrong/typedoc/issues/2346
 */
function addDecoratorInfo(context, decl) {
  const symbol = context.getSymbolFromReflection(decl);
  if (!symbol) return;

  const declaration = symbol.valueDeclaration;
  if (!declaration) return;
  if (
    !ts.isPropertyDeclaration(declaration) &&
    !ts.isMethodDeclaration(declaration) &&
    !ts.isGetAccessorDeclaration(declaration)
  ) {
    return;
  }

  const decorators = declaration.modifiers?.filter(ts.isDecorator);
  for (const decorator of decorators ?? []) {
    const expr = decorator.getText().split("(", 1)[0];
    const modifierTags = [];
    switch (expr) {
      case "@action":
      case "@action.bound": {
        modifierTags.push(expr);
        break;
      }
      case "@computed":
      case "@computed.struct": {
        modifierTags.push("@computed");
        break;
      }
      default: {
        console.warn("Unknown decorator:", expr);
        break;
      }
    }
    if (modifierTags.length > 0) {
      decl.comment ??= new td.Comment();
      for (const tag of modifierTags) {
        decl.comment.modifierTags.add(tag);
      }
    }
  }
}
