/** Key paths */
export type KeyPath = KeyPath.Component | KeyPath.Self;

export namespace KeyPath {
  /** Branded type for key path components */
  export type Component = string & { __brand: "KeyPath.Component" };
  /** Branded type for a self-referencing key path */
  export type Self = symbol & { __brand: "KeyPath.Self" };
  /** Self path symbol */
  export const Self = Symbol("self") as Self;

  /**
   * Whether a key path is a self path
   *
   * Empty strings are also considered self paths.
   */
  export function isSelf(keyPath: KeyPath): keyPath is Self {
    return keyPath === Self || keyPath === "";
  }

  /** Build a key path from an array of keys */
  export function build(...keys: (KeyPath | string | number | null)[]): KeyPath {
    const keyPath = keys
      .flatMap((key) => {
        switch (typeof key) {
          case "string":
            if (key === "") return []; // ignores empty keys
            return [key];
          case "number":
            return [String(key)];
          case "symbol":
            return []; // ignores KeyPath.Self
          default:
            key satisfies null;
            return [];
        }
      })
      .join(".");
    if (keyPath === "") return Self;
    return keyPath as KeyPath;
  }

  /**
   * Get the relative key path from a prefix key path.
   *
   * @returns The relative key path or null if the key path is not a child of the prefix key path.
   */
  export function getRelative(keyPath: KeyPath, prefixKeyPath: KeyPath) {
    if (isSelf(keyPath)) return Self;
    if (isSelf(prefixKeyPath)) return keyPath;
    if (!`${keyPath}.`.startsWith(`${prefixKeyPath}.`)) return null;
    return build(keyPath.slice(prefixKeyPath.length + 1));
  }

  /**
   * Get the parent key of a key path
   *
   * @returns The parent key or a self path if the key path is a self path
   */
  export function getParentKey(keyPath: KeyPath): KeyPath {
    if (isSelf(keyPath)) return Self;
    const [parentKey] = keyPath.split(".", 1);
    return (parentKey as Component) || Self;
  }

  /**
   * Iterate over all ancestors of a key path
   *
   * @returns The ancestors of the key path
   */
  export function* getAncestors(keyPath: KeyPath, includeSelf = true): Generator<KeyPath> {
    if (includeSelf) {
      yield keyPath || Self;
    }
    if (isSelf(keyPath)) {
      return;
    }
    const parts = keyPath.split(".");
    while (parts.length > 1) {
      parts.pop();
      yield build(...parts);
    }
  }
}

/**
 * Read-only interface for {@link KeyPathMultiMap}.
 */
export interface ReadonlyKeyPathMultiMap<T> extends Iterable<[KeyPath, T]> {
  /** The number of key paths */
  readonly size: number;
  /** Whether the map contains a key path */
  has(keyPath: KeyPath): boolean;
  /** Find exact matches for a key path */
  findExact(keyPath: KeyPath): Generator<T>;
  /** Find prefix matches for a key path */
  findPrefix(keyPath: KeyPath): Generator<T>;
  /** Get values for a key path */
  get(keyPath: KeyPath, prefixMatch?: boolean): Set<T>;
}

/**
 * Map to store multiple values with the same key path
 * with support for prefix matching.
 */
export class KeyPathMultiMap<T> implements ReadonlyKeyPathMultiMap<T> {
  /** Map to store key path -> values mapping */
  readonly #map = new Map<KeyPath, Set<T>>();
  /** Map to store key path -> child key paths mapping */
  readonly #prefixMap = new Map<KeyPath, Set<KeyPath>>();

  /** The number of key paths */
  get size() {
    return this.#map.size;
  }

  /** Whether the map contains a key path */
  has(keyPath: KeyPath, prefixMatch = false) {
    if (this.#map.has(keyPath)) {
      return true;
    }
    if (prefixMatch) {
      return this.#prefixMap.has(keyPath);
    }
    return false;
  }

  /** Find exact matches for a key path */
  *findExact(keyPath: KeyPath) {
    const values = this.#map.get(keyPath);
    if (values) {
      yield* values;
    }
  }

  /** Find prefix matches for a key path */
  *findPrefix(keyPath: KeyPath) {
    if (KeyPath.isSelf(keyPath)) {
      for (const values of this.#map.values()) {
        yield* values;
      }
      return;
    }

    const exactMatches = this.#map.get(keyPath);
    if (exactMatches) {
      yield* exactMatches;
    }

    const childPaths = this.#prefixMap.get(keyPath);
    if (childPaths) {
      for (const childPath of childPaths) {
        yield* this.findExact(childPath);
      }
    }
  }

  /** Get values for a key path */
  get(keyPath: KeyPath, prefixMatch = false): Set<T> {
    if (prefixMatch) {
      return new Set(this.findPrefix(keyPath));
    }
    return new Set(this.findExact(keyPath));
  }

  /** Add a value for a key path */
  set(keyPath: KeyPath, value: T): void {
    if (Object.isFrozen(this)) {
      throw new Error("Cannot modify frozen KeyPathMultiMap");
    }

    // Add to main map
    let values = this.#map.get(keyPath);
    if (!values) {
      values = new Set();
      this.#map.set(keyPath, values);
    }
    values.add(value);

    // Update prefix map
    for (const ancestorKeyPath of KeyPath.getAncestors(keyPath, false)) {
      let children = this.#prefixMap.get(ancestorKeyPath);
      if (!children) {
        children = new Set();
        this.#prefixMap.set(ancestorKeyPath, children);
      }
      children.add(keyPath);
    }
  }

  /** Remove a key path */
  delete(keyPath: KeyPath): void {
    if (Object.isFrozen(this)) {
      throw new Error("Cannot modify frozen KeyPathMultiMap");
    }

    // Remove from main map
    this.#map.delete(keyPath);

    // Update prefix map
    for (const ancestorKeyPath of KeyPath.getAncestors(keyPath, false)) {
      const children = this.#prefixMap.get(ancestorKeyPath);
      if (children) {
        children.delete(keyPath);
        if (children.size === 0) {
          this.#prefixMap.delete(ancestorKeyPath);
        }
      }
    }
  }

  /** Iterate over all values */
  *[Symbol.iterator](): IterableIterator<[KeyPath, T]> {
    for (const [keyPath, values] of this.#map.entries()) {
      for (const value of values) {
        yield [keyPath, value];
      }
    }
  }

  /** Create an immutable version of this map */
  toImmutable() {
    Object.freeze(this);
    return this as ReadonlyKeyPathMultiMap<T>;
  }
}
