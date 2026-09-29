/** Brand of the key path types, which exists only at the type level */
declare const keyPathBrand: unique symbol;

/**
 * Key paths represent paths to access nested properties in an object
 *
 * Key paths can be either:
 * - A dot-notation string representing nested properties (e.g. "user.address.street")
 * - A special Self symbol representing the current object
 */
export type KeyPath = KeyPath.Component | KeyPath.Self;

export namespace KeyPath {
  /** Branded type for key path components */
  export type Component = string & { [keyPathBrand]: unknown };
  /** Branded type for a self-referencing key path */
  export type Self = symbol & { [keyPathBrand]: unknown };
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

  /**
   * Build a key path from an array of keys
   *
   * @remarks
   * - Joins keys with dots
   * - Ignores null values
   * - Ignores empty strings
   * - Handles {@link KeyPath.Self}
   *
   * @returns The constructed key path
   */
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
   * Get the relative key path from a prefix key path
   *
   * @returns
   * - `null` if the key path is not a child of the prefix
   * - {@link KeyPath.Self} if the paths are identical
   * - The original path if the prefix is {@link KeyPath.Self}
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
   * Get all ancestors of a key path
   *
   * @remarks
   * The root object is not an ancestor, so a top-level key has no ancestors.
   *
   * @param includeSelf Whether to include the path itself
   *
   * @returns
   * - The key path itself when `includeSelf` is true ({@link KeyPath.Self} for self paths)
   * - Key paths starting from the closest ancestor and moving up to the top-level key
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
 * A pattern that matches key paths
 *
 * Keys are separated by dots, as in a key path, and three spellings have a meaning of their own:
 * - `.` matches the self path, as {@link KeyPath.Self} and an empty string do
 * - `*` matches exactly one key
 * - `**` matches any number of keys, including none, so `items.**` matches `items` itself as well
 *
 * Any other key matches only a key spelled the same way, so a pattern without wildcards matches just the key path it
 * spells. There is no escaping: a key spelled `*` or `**` is always a wildcard.
 *
 * @example
 * ```typescript
 * validator.getErrorMessages("email"); // email
 * validator.getErrorMessages("items.*"); // items.0 and items.1, but neither items nor items.0.name
 * validator.getErrorMessages("items.*.name"); // items.0.name and items.1.name
 * validator.getErrorMessages("items.**"); // items, items.0, items.0.name, ...
 * validator.getErrorMessages("."); // the errors of the object itself
 * validator.getErrorMessages("**"); // every error
 * ```
 */
export type KeyPathPattern = string | KeyPath;

/**
 * How far a key path matches a {@link KeyPathPattern}, read key by key
 *
 * `**` can take any number of keys, so a match can stand at several positions of the pattern at once.
 */
export class KeyPathPatternMatch {
  /** Keys of the pattern */
  readonly #keys: readonly string[];
  /** Positions in the pattern that the keys read so far reach */
  readonly #positions: ReadonlySet<number>;

  private constructor(keys: readonly string[], positions: ReadonlySet<number>) {
    this.#keys = keys;
    this.#positions = positions;
  }

  /** Start matching a pattern */
  static start(pattern: KeyPathPattern) {
    const keys = typeof pattern === "string" && pattern !== "" && pattern !== "." ? pattern.split(".") : [];
    return new KeyPathPatternMatch(keys, reach(keys, [0]));
  }

  /** Whether the keys read so far match the whole pattern */
  get isComplete() {
    return this.#positions.has(this.#keys.length);
  }

  /**
   * Key paths that the rest of the pattern starts with, spelled out up to its next wildcard
   *
   * @returns null when a wildcard comes next, so that any key can follow
   */
  get nextKeyPaths(): KeyPath[] | null {
    const result: KeyPath[] = [];
    for (const position of this.#positions) {
      let end = position;
      while (end < this.#keys.length && this.#keys[end] !== "*" && this.#keys[end] !== "**") end++;
      if (end === position && end < this.#keys.length) return null;
      result.push(KeyPath.build(...this.#keys.slice(position, end)));
    }
    return result;
  }

  /**
   * Read the keys of a key path
   *
   * @returns The match after them, or null when no key path starting with them matches the pattern
   */
  read(keyPath: KeyPath): KeyPathPatternMatch | null {
    let positions = this.#positions;
    for (const key of KeyPath.isSelf(keyPath) ? [] : keyPath.split(".")) {
      const next: number[] = [];
      for (const position of positions) {
        const patternKey = this.#keys[position];
        if (patternKey === "**") {
          next.push(position);
        } else if (patternKey === "*" || patternKey === key) {
          next.push(position + 1);
        }
      }
      positions = reach(this.#keys, next);
      if (!positions.size) return null;
    }
    return new KeyPathPatternMatch(this.#keys, positions);
  }
}

/** Positions in a pattern reached from the given ones, where `**` can take no key at all */
function reach(keys: readonly string[], positions: Iterable<number>): ReadonlySet<number> {
  const result = new Set<number>();
  for (let position of positions) {
    result.add(position);
    while (keys[position] === "**") result.add(++position);
  }
  return result;
}

/**
 * Read-only interface for {@link KeyPathMultiMap}.
 */
export interface ReadonlyKeyPathMultiMap<T> extends Iterable<[KeyPath, T]> {
  /** The number of key paths */
  readonly size: number;
}

/**
 * Map to store multiple values with the same key path
 */
export class KeyPathMultiMap<T> implements ReadonlyKeyPathMultiMap<T> {
  /** Map to store key path -> values mapping */
  readonly #map = new Map<KeyPath, Set<T>>();

  /** The number of key paths */
  get size() {
    return this.#map.size;
  }

  /** Add a value for a key path */
  set(keyPath: KeyPath, value: T): void {
    if (Object.isFrozen(this)) {
      throw new Error("Cannot modify frozen KeyPathMultiMap");
    }

    let values = this.#map.get(keyPath);
    if (!values) {
      values = new Set();
      this.#map.set(keyPath, values);
    }
    values.add(value);
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
