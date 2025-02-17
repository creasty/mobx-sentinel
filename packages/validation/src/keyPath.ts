/** Branded type for key paths */
export type KeyPath = string & { __brand: "KeyPath" };

/** Build a key path (dot-separated keys) from an array of keys */
export function buildKeyPath(...keys: (string | number | null)[]): KeyPath {
  const keyPath = keys
    .flatMap((key) => {
      if (typeof key === "string") {
        return key ? [key] : []; // Ignore empty keys
      }
      if (typeof key === "number") {
        return [String(key)];
      }
      return [];
    })
    .join(".");
  return keyPath as KeyPath;
}

/**
 * Map to store multiple values with the same key path
 * with support for prefix matching.
 */
export class KeyPathMultiMap<T> {
  /** Map to store key path -> values mapping */
  readonly #map = new Map<KeyPath, Set<T>>();
  /** Map to store key path -> child key paths mapping */
  readonly #prefixMap = new Map<KeyPath, Set<KeyPath>>();

  /** Find exact matches for a key path */
  *findExact(keyPath: KeyPath) {
    const values = this.#map.get(keyPath);
    if (values) {
      yield* values;
    }
  }

  /** Find prefix matches for a key path */
  *findPrefix(keyPath: KeyPath) {
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
    // Add to main map
    let values = this.#map.get(keyPath);
    if (!values) {
      values = new Set();
      this.#map.set(keyPath, values);
    }
    values.add(value);

    // Update prefix map
    const parts = keyPath.split(".");
    while (parts.length > 1) {
      parts.pop();
      const prefix = parts.join(".") as KeyPath;
      let children = this.#prefixMap.get(prefix);
      if (!children) {
        children = new Set();
        this.#prefixMap.set(prefix, children);
      }
      children.add(keyPath);
    }
  }

  /** Remove a key path */
  delete(keyPath: KeyPath): void {
    // Remove from main map
    this.#map.delete(keyPath);

    // Update prefix map
    const parts = keyPath.split(".");
    while (parts.length > 1) {
      parts.pop();
      const prefix = parts.join(".") as KeyPath;
      const children = this.#prefixMap.get(prefix);
      if (children) {
        children.delete(keyPath);
        if (children.size === 0) {
          this.#prefixMap.delete(prefix);
        }
      }
    }
  }

  /** Iterate over all values */
  *[Symbol.iterator](): IterableIterator<[KeyPath, T]> {
    const seen = new Set<T>();
    for (const [keyPath, values] of this.#map.entries()) {
      for (const value of values) {
        if (!seen.has(value)) {
          seen.add(value);
          yield [keyPath, value];
        }
      }
    }
  }
}
