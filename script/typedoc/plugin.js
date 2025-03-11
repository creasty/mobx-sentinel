import * as td from "typedoc";

const ts = td.TypeScript;

/**
 * @param {td.Application} app
 */
export function load(app) {
  app.converter.on(td.Converter.EVENT_END, (context) => {
    clusterSameNameEntries(context.project);
  });
  app.converter.on(td.Converter.EVENT_CREATE_DECLARATION, addDecoratorInfo);
}

/**
 * @param {td.ContainerReflection} container
 */
function clusterSameNameEntries(container) {
  if (
    !container.kindOf(
      td.ReflectionKind.Project | td.ReflectionKind.Module | td.ReflectionKind.Namespace | td.ReflectionKind.Class
    )
  ) {
    return;
  }

  /** @type Map<string, number> */
  const canonicalOrderMap = new Map();
  /** @type WeakMap<td.DeclarationReflection, number> */
  const orderMap = new WeakMap();

  for (let i = 0, children = container.children ?? [], len = children.length; i < len; i++) {
    const child = children[i];
    const key = child.getFullName();

    let canonicalOrder = canonicalOrderMap.get(key);
    if (typeof canonicalOrder !== "number") {
      canonicalOrder = i;
      canonicalOrderMap.set(key, canonicalOrder);
    }
    // Penalize namespaces to push them to the bottom within the same-named group
    const penalty = child.kindOf(td.ReflectionKind.Namespace) ? 0.1 : 0;
    // Keep the original order of children consistent
    const localOrder = i / len / 10;
    // Fractional indexing
    orderMap.set(child, canonicalOrder + localOrder + penalty);

    // Recurse into children
    if (child.children) clusterSameNameEntries(child);
  }

  container.children.sort((a, b) => orderMap.get(a) - orderMap.get(b));
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
      //console.log('Add decorator tag:', decl.getFullName(), modifierTags);
    }
  }
}
