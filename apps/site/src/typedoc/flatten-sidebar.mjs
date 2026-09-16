/**
 * A Starlight plugin that lists each package's API reference pages directly under the package, without the Classes,
 * Interfaces, Type Aliases and Functions groups starlight-typedoc sorts them into.
 *
 * starlight-typedoc builds each of those groups as `{ label: "Classes", items: [{ autogenerate: { directory } }] }`, so
 * putting the lone autogenerate entry in the group's place lists the same pages in the same order. A group for an entry
 * point, like react's `extension`, holds groups rather than a lone autogenerate entry, so it stays.
 *
 * It must come after starlight-typedoc in `plugins`: that plugin fills in the API reference group during
 * `config:setup`, and Starlight hands each plugin the configuration the ones before it updated.
 *
 * @param {string} label The API reference group's label, the `sidebar.label` given to starlight-typedoc
 * @returns {import("@astrojs/starlight/types").StarlightPlugin}
 */
export function flattenApiSidebar(label) {
  return {
    name: "flatten-api-sidebar",
    hooks: {
      "config:setup"({ config, updateConfig }) {
        if (!config.sidebar) return;
        updateConfig({ sidebar: config.sidebar.map((item) => findApiGroup(item, label)) });
      },
    },
  };
}

/**
 * @param {any} item
 * @param {string} label
 * @returns {any}
 */
function findApiGroup(item, label) {
  if (!isGroup(item)) return item;
  // Only the API reference: the guides' groups are built from a lone autogenerate entry too.
  if (item.label === label) return flattenKindGroups(item);
  return { ...item, items: item.items.map((/** @type {any} */ child) => findApiGroup(child, label)) };
}

/**
 * @param {any} group
 * @returns {any}
 */
function flattenKindGroups(group) {
  return {
    ...group,
    items: group.items.map((/** @type {any} */ item) => {
      if (!isGroup(item)) return item;
      const [only] = item.items;
      if (item.items.length === 1 && !isGroup(only) && "autogenerate" in only) return only;
      return flattenKindGroups(item);
    }),
  };
}

/**
 * @param {any} item
 */
function isGroup(item) {
  return typeof item === "object" && item !== null && "items" in item;
}
