import { createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";
import { KeyPath, buildKeyPath } from "./keyPath";
import { unwrapShallowContents } from "./mobx";

const nestedKey = Symbol("nested");

/**
 * Annotation for nested objects
 */
export const nested = createPropertyLikeAnnotation(nestedKey, () => true);

/**
 * Get all `@nested` annotations from the target object
 */
export function* getNestedAnnotations(target: object): Generator<[key: string | symbol | number, getValue: () => any]> {
  const processor = getAnnotationProcessor(target);
  if (!processor) return;

  const annotations = processor.getPropertyLike(nestedKey);
  if (!annotations) return;

  for (const [key, metadata] of annotations) {
    const getValue = () => (key in target ? (target as any)[key] : metadata.get?.());
    yield [key, getValue];
  }
}

export class StandardNestedFetcher<T extends object> {
  readonly #fetchers = new Map<string, () => ReadonlyArray<StandardNestedFetcher.Entry<T>>>();

  constructor(target: object, transform: (entry: StandardNestedFetcher.Entry<any>) => T | null) {
    for (const [key, getValue] of getNestedAnnotations(target)) {
      if (typeof key !== "string") continue; // symbol and number keys are not supported

      const fetcher = () => {
        const result: Array<StandardNestedFetcher.Entry<T>> = [];
        for (const [subKey, value] of unwrapShallowContents(getValue())) {
          if (typeof subKey === "symbol") continue; // symbol keys are not supported
          const keyPath = buildKeyPath(key, subKey);
          const data = transform({ key, keyPath, data: value });
          if (!data) continue;
          result.push({ key, keyPath, data });
        }
        return result;
      };

      this.#fetchers.set(key, fetcher);
    }
  }

  *[Symbol.iterator]() {
    for (const fn of this.#fetchers.values()) {
      for (const entry of fn()) {
        yield entry;
      }
    }
  }
}

export namespace StandardNestedFetcher {
  export type Entry<T extends object> = {
    readonly key: string;
    readonly keyPath: KeyPath;
    readonly data: T;
  };
}
