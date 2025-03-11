import { comparer, computed, makeObservable } from "mobx";
import { createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";
import { KeyPath } from "./keyPath";
import { unwrapShallowContents } from "./mobx-utils";

enum NestedMode {
  /**
   * Nested objects are nested under a new key.
   */
  Default = "@nested",
  /**
   * Nested objects are hoisted to the parent object.
   */
  Hoist = "@nested.hoist",
}

const nestedKey = Symbol("nested");
const createNested = createPropertyLikeAnnotation(nestedKey, () => NestedMode.Default);
const createNestedHoist = createPropertyLikeAnnotation(nestedKey, () => NestedMode.Hoist);

/**
 * Annotation for nested objects
 *
 * @remarks
 * - Mixed nested modes for the same key are not allowed
 *
 * @function
 */
export const nested = Object.assign(createNested, {
  /**
   * Annotation for nested objects that should be hoisted to the parent object
   *
   * When using hoist mode:
   * - Nested objects are treated as part of the parent object
   * - Changes and errors from nested objects appear on the parent
   *
   * @remarks
   * - Multiple hoisted keys within the same inheritance chain are not allowed
   *
   * @example
   * ```typescript
   * @nested.hoist @observable private list: Sample[] = [];
   * // Key path for "list.0.value" becomes "0.value"
   * ```
   *
   * @function
   */
  hoist: createNestedHoist,
});

/**
 * Get all `@nested` annotations from the target object
 */
export function* getNestedAnnotations(target: object): Generator<{
  key: string | symbol;
  getValue: () => any;
  hoist: boolean;
}> {
  const processor = getAnnotationProcessor(target);
  if (!processor) return;

  const annotations = processor.getPropertyLike(nestedKey);
  if (!annotations) return;

  let hoistedKey: string | symbol | null = null;
  for (const [key, metadata] of annotations) {
    const modes = new Set<NestedMode>(metadata.data);
    if (modes.size > 1) {
      throw new Error(`Mixed @nested annotations are not allowed for the same key: ${String(key)}`);
    }
    const hoist = modes.has(NestedMode.Hoist);
    if (hoist) {
      if (hoistedKey) {
        throw new Error(
          `Multiple @nested.hoist annotations are not allowed in the same class: ${String(hoistedKey)} and ${String(key)}`
        );
      }
      hoistedKey = key;
    }
    const getValue = () => (key in target ? (target as any)[key] : metadata.get?.());
    yield { key, getValue, hoist };
  }
}

/**
 * A fetcher that returns all nested entries
 *
 * Key features:
 * - Tracks nested objects in properties, arrays, sets, and maps
 * - Provides access to nested objects by key path
 * - Supports iteration over all nested objects
 * - Maintains parent-child relationships
 *
 * @remarks
 * Symbol keys are not supported
 */
export class StandardNestedFetcher<T extends object> implements Iterable<StandardNestedFetcher.Entry<T>> {
  readonly #transform: (entry: StandardNestedFetcher.Entry<any>) => T | null;
  readonly #fetchers = new Map<KeyPath, () => Generator<StandardNestedFetcher.Entry<T>>>();

  /**
   * @param target - The target object
   * @param transform - A function that transforms the entry to the desired type.\
   *   If the function returns `null`, the entry is ignored.
   */
  constructor(target: object, transform: (entry: StandardNestedFetcher.Entry<any>) => T | null) {
    makeObservable(this);

    this.#transform = transform;

    for (const { key, getValue, hoist } of getNestedAnnotations(target)) {
      if (typeof key !== "string") continue; // symbol keys are not supported
      const keyPath = hoist ? KeyPath.Self : KeyPath.build(key);
      const fetcher = this.#createFetcher(keyPath, getValue);
      this.#fetchers.set(keyPath, fetcher);
    }
  }

  #createFetcher(key: KeyPath, getValue: () => any) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    return function* (): Generator<StandardNestedFetcher.Entry<T>> {
      for (const [subKey, value] of unwrapShallowContents(getValue())) {
        if (typeof subKey === "symbol") continue; // symbol keys are not supported
        const keyPath = KeyPath.build(key, subKey);
        const data = that.#transform({ key, keyPath, data: value }) ?? null;
        if (data === null) continue;
        yield { key, keyPath, data };
      }
    };
  }

  /** Iterate over all entries */
  *[Symbol.iterator]() {
    for (const fn of this.#fetchers.values()) {
      for (const entry of fn()) {
        yield entry;
      }
    }
  }

  /** Iterate over all entries for the given key path */
  *getForKey(keyPath: KeyPath) {
    const fetcher = this.#fetchers.get(keyPath);
    if (!fetcher) return;
    for (const entry of fetcher()) {
      yield entry;
    }
  }

  /** Map of key paths to data */
  @computed({ equals: comparer.shallow })
  get dataMap(): ReadonlyMap<KeyPath, T> {
    const result = new Map<KeyPath, T>();
    for (const entry of this) {
      result.set(entry.keyPath, entry.data);
    }
    return result;
  }
}

export namespace StandardNestedFetcher {
  /**
   * Entry representing a nested object
   *
   * @remarks
   * Used when iterating over nested objects to provide context about their location
   */
  export type Entry<T extends object> = {
    /** Name of the field containing the nested object */
    readonly key: KeyPath;
    /** Full path to the nested object */
    readonly keyPath: KeyPath;
    /** Data */
    readonly data: T;
  };
}
