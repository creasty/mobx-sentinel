import { createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";
import { KeyPath, buildKeyPath } from "./keyPath";
import { unwrapShallowContents } from "./mobx-utils";

const nestedKey = Symbol("nested");

/**
 * Annotation for nested objects
 */
export const nested = createPropertyLikeAnnotation(nestedKey, () => true);

/**
 * Get all `@nested` annotations from the target object
 */
export function* getNestedAnnotations(target: object): Generator<[key: string | symbol, getValue: () => any]> {
  const processor = getAnnotationProcessor(target);
  if (!processor) return;

  const annotations = processor.getPropertyLike(nestedKey);
  if (!annotations) return;

  for (const [key, metadata] of annotations) {
    const getValue = () => (key in target ? (target as any)[key] : metadata.get?.());
    yield [key, getValue];
  }
}

/**
 * A fetcher that returns all nested entries
 *
 * Annotation keys that are symbols are ignored.
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
    this.#transform = transform;

    for (const [key, getValue] of getNestedAnnotations(target)) {
      if (typeof key !== "string") continue; // symbol keys are not supported
      const keyPath = buildKeyPath(key);
      this.#fetchers.set(keyPath, this.#createFetcher(keyPath, getValue));
    }
  }

  #createFetcher(key: KeyPath, getValue: () => any) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    function* fetcher() {
      for (const [subKey, value] of unwrapShallowContents(getValue())) {
        if (typeof subKey === "symbol") continue; // symbol keys are not supported
        const keyPath = buildKeyPath(key, subKey);
        const data = that.#transform({ key, keyPath, data: value }) ?? null;
        if (data === null) continue;
        yield { key, keyPath, data };
      }
    }
    return fetcher;
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
}

export namespace StandardNestedFetcher {
  /** Nested entry */
  export type Entry<T extends object> = {
    /** Name of the field that has the nested annotation */
    readonly key: KeyPath;
    /** Key path to the nested entry */
    readonly keyPath: KeyPath;
    /** Data */
    readonly data: T;
  };
}
