import { action, autorun, computed, makeObservable, observable, reaction, runInAction, transaction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";
import { getMobxObservableAnnotations, shallowReadValue, unwrapShallowContents } from "./mobx-utils";
import { StandardNestedFetcher, getNestedAnnotations } from "./nested";
import { KeyPath, buildKeyPath } from "./keyPath";

enum WatchMode {
  /**
   * Watch only reassignments
   *
   * Akin to `@observable.ref`.
   */
  Ref = "@watch.ref",
  /**
   * Watch shallow changes
   *
   * Akin to `@observable.shallow`?
   */
  Shallow = "@watch",
}

const watchKey = Symbol("watch");
const createWatch = createPropertyLikeAnnotation(watchKey, () => WatchMode.Shallow);
const createWatchRef = createPropertyLikeAnnotation(watchKey, () => WatchMode.Ref);
const unwatchKey = Symbol("unwatch");
const createUnwatch = createPropertyLikeAnnotation(unwatchKey, () => true);

/** Global state for controlling whether watching is enabled */
let unwatchStackCount = 0;
function runInUnwatch(action: () => void): void {
  transaction(() => {
    ++unwatchStackCount;
    try {
      action();
    } finally {
      autorun(() => --unwatchStackCount);
    }
  });
}

/**
 * Annotation for watching changes to a property and a getter
 *
 * - `@observable` and `@computed` (and their variants) are automatically assumed to be `@watched`,\
 *    unless `@unwatch` or `@unwatch.ref` is specified.
 * - `@nested` (and its variants) are considered `@watched` unless `@unwatch` is specified.
 * - If `@watch` and `@watch.ref` are specified for the same key (in the same inheritance chain),\
 *   the last annotation prevails.
 */
export const watch = Object.freeze(
  Object.assign(createWatch, {
    /**
     * Annotation for watching only assignments to a property and a getter
     *
     * It has no effect when combined with `@nested`.
     */
    ref: createWatchRef,
  })
);

/**
 * Annotation for unwatching changes to a property and a getter
 *
 * When used as an annotation:
 * - Combine with `@observable`, `@computed` or `@nested` (and their variants) to stop watching changes.
 * - You cannot re-enable watching once `@unwatch` is specified.
 *
 * When used as a function:
 * - Runs a piece of code without changes being detected by Watcher.
 *   ```typescript
 *   unwatch(() => (model.field = "value"));
 *   ```
 * - Warning: When used inside a transaction, it only becomes 'watching' when the outermost transaction completes.
 *   ```typescript
 *   runInAction(() => {
 *     unwatch(() => {
 *       // isWatching === false
 *     });
 *     // isWatching === FALSE <-- already in a transaction
 *     unwatch(() => {
 *       // isWatching === false
 *     });
 *   });
 *   // isWatching === TRUE
 *   ```
 */
export const unwatch: typeof runInUnwatch & typeof createUnwatch = (...args: any[]) => {
  if (args.length === 1 && typeof args[0] === "function") {
    return runInUnwatch(args[0]);
  }
  return createUnwatch(...(args as Parameters<typeof createUnwatch>));
};

const watcherKey = Symbol("watcher");
const internalToken = Symbol("watcher.internal");

/** Watcher for changes to a target object */
export class Watcher {
  readonly id = uuidV4();
  readonly #assumeChanged = observable.box(false);
  readonly #changedTick = observable.box(0n);
  readonly #changedKeys = observable.set<KeyPath>();
  readonly #processedKeys = new Set<string>();
  readonly #nestedFetcher: StandardNestedFetcher<Watcher>;

  /**
   * Get a watcher for a target object
   *
   * @throws TypeError when the target is not an object.
   */
  static get<T extends object>(target: T): Watcher {
    const watcher = this.getSafe(target);
    if (!watcher) throw new TypeError("target: Expected an object");
    return watcher;
  }

  /**
   * Get a watcher for a target object
   *
   * Same as {@link Watcher.get} but returns null instead of throwing an error.
   */
  static getSafe(target: any): Watcher | null {
    if (!target || typeof target !== "object") {
      return null;
    }

    let watcher: Watcher | null = (target as any)[watcherKey] ?? null;
    if (!watcher) {
      watcher = new this(internalToken, target);
      Object.defineProperty(target, watcherKey, { value: watcher });
    }
    return watcher;
  }

  /** Whether Watcher is enabled in the current transaction */
  static get isWatching() {
    return unwatchStackCount === 0;
  }

  private constructor(token: symbol, target: object) {
    if (token !== internalToken) {
      throw new Error("private constructor");
    }

    this.#nestedFetcher = new StandardNestedFetcher(target, (entry) => Watcher.getSafe(entry.data));
    this.#processUnwatchAnnotations(target);
    this.#processNestedAnnotations(target);
    this.#processWatchAnnotations(target);
    this.#processMobxAnnotations(target);

    makeObservable(this);
  }

  /**
   * The total number of changes have been processed
   *
   * The value is incremented for each change and each key.
   * Observe this value to react to changes.
   */
  get changedTick() {
    return this.#changedTick.get();
  }

  /** Whether changes have been made */
  @computed
  get changed() {
    return this.changedTick > 0n || this.#assumeChanged.get();
  }

  /**
   * The keys that have changed
   *
   * Keys of nested objects are NOT included.
   */
  @computed.struct
  get changedKeys(): ReadonlySet<KeyPath> {
    return new Set(this.#changedKeys);
  }

  /**
   * The key paths that have changed
   *
   * Keys of nested objects are included.
   */
  @computed.struct
  get changedKeyPaths(): ReadonlySet<KeyPath> {
    const result = new Set(this.#changedKeys);
    for (const entry of this.#nestedFetcher) {
      for (const changedKeyPath of entry.data.changedKeyPaths) {
        result.add(buildKeyPath(entry.keyPath, changedKeyPath));
      }
    }
    return result;
  }

  /** Nested watchers */
  get nested() {
    return this.#nestedFetcher.dataMap;
  }

  /** Reset the changed keys */
  @action
  reset() {
    this.#changedKeys.clear();
    this.#changedTick.set(0n);
    this.#assumeChanged.set(false);

    for (const entry of this.#nestedFetcher) {
      entry.data.reset();
    }
  }

  /**
   * Assume some changes have been made
   *
   * It only changes {@link changed} to true and does not increment {@link changedTick}.
   */
  @action
  assumeChanged() {
    if (!Watcher.isWatching) return;
    this.#assumeChanged.set(true);
  }

  /** Mark a key as changed */
  #didChange(key: KeyPath) {
    if (!Watcher.isWatching) return;
    runInAction(() => {
      this.#changedKeys.add(key);
      this.#incrementChangedTick();
    });
  }

  /**
   * Increment the changed tick
   *
   * For when a key or key path is changed.
   */
  #incrementChangedTick() {
    if (!Watcher.isWatching) return;
    runInAction(() => {
      this.#changedTick.set(this.#changedTick.get() + 1n);
    });
  }

  /**
   * Process MobX's `@observable` and `@computed` annotations
   */
  #processMobxAnnotations(target: object) {
    for (const [key, getValue] of getMobxObservableAnnotations(target)) {
      if (typeof key !== "string") continue; // symbol and number keys are not supported
      if (this.#processedKeys.has(key)) continue;
      this.#processedKeys.add(key);

      reaction(
        () => shallowReadValue(getValue()),
        () => this.#didChange(buildKeyPath(key))
      );
    }
  }

  /**
   * Process `@nested` annotations
   */
  #processNestedAnnotations(target: object) {
    for (const { key, getValue, hoist } of getNestedAnnotations(target)) {
      if (typeof key !== "string") continue; // symbol and number keys are not supported
      if (this.#processedKeys.has(key)) continue;
      this.#processedKeys.add(key);

      reaction(
        () => shallowReadValue(getValue()),
        () => (hoist ? this.#incrementChangedTick() : this.#didChange(buildKeyPath(key)))
      );
      reaction(
        () => {
          let changed = false;
          for (const [, value] of unwrapShallowContents(getValue())) {
            if (Watcher.getSafe(value)?.changed) {
              changed = true;
              // Warning: Do not early break here.
              // We need to process all nested values to be reactive in future changes.
            }
          }
          return changed;
        },
        (changed) => changed && this.#incrementChangedTick()
      );
    }
  }

  /**
   * Process `@watch` and `@watch.ref` annotations
   */
  #processWatchAnnotations(target: object) {
    const processor = getAnnotationProcessor(target);
    if (!processor) return;

    const watchAnnotations = processor.getPropertyLike(watchKey);
    if (!watchAnnotations) return;

    for (const [key, metadata] of watchAnnotations) {
      if (typeof key !== "string") continue; // symbol and number keys are not supported
      if (this.#processedKeys.has(key)) continue;
      this.#processedKeys.add(key);

      const isShallow = metadata.data.at(-1) === WatchMode.Shallow; // Last annotation prevails
      const getValue = () => (key in target ? (target as any)[key] : metadata.get?.());

      reaction(
        () => (isShallow ? shallowReadValue(getValue()) : getValue()),
        () => this.#didChange(buildKeyPath(key))
      );
    }
  }

  /**
   * Process `@unwatch` annotations
   */
  #processUnwatchAnnotations(target: object) {
    const processor = getAnnotationProcessor(target);
    if (!processor) return;

    const unwatchAnnotations = processor.getPropertyLike(unwatchKey);
    if (!unwatchAnnotations) return;

    for (const [key] of unwatchAnnotations) {
      if (typeof key !== "string") continue; // symbol and number keys are not supported
      this.#processedKeys.add(key);
    }
  }

  /** @internal @ignore */
  [internalToken]() {
    return {
      didChange: this.#didChange.bind(this),
    };
  }
}

/** @internal @ignore */
export function debugWatcher(watcher: Watcher) {
  return watcher[internalToken]();
}
