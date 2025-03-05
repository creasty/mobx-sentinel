import * as td from "typedoc";

/** @param {td.Application} app */
export function load(app) {
  app.converter.on(td.Converter.EVENT_END, (context) => {
    sort(context.project);
  });
}

/**
 * Sort children of the given container.
 *
 * @param container {td.ContainerReflection}
 */
function sort(container) {
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

  // Group children with the same name together
  for (let i = 0, children = container.children ?? [], len = children.length; i < len; i++) {
    const child = children[i];
    const key = child.getFullName();

    let canonicalOrder = canonicalOrderMap.get(key);
    if (typeof canonicalOrder !== "number") {
      canonicalOrder = i;
      canonicalOrderMap.set(key, canonicalOrder);
    }
    orderMap.set(child, canonicalOrder + i / len);

    if (child.children) sort(child);
  }

  container.children.sort((a, b) => orderMap.get(a) - orderMap.get(b));
}
