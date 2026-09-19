import { action, autorun, computed, makeObservable, observable, reaction, runInAction, transaction } from "mobx";
import { randomId } from "./randomId";
import { createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";
import { getMobxObservableAnnotations, shallowReadValue, unwrapShallowContents } from "./mobx-utils";
import { StandardNestedFetcher, getNestedAnnotations } from "./nested";
import { KeyPath } from "./keyPath";

enum WatchMode {
  /**
   * Watch values with identity comparison
   *
   * Akin to `@observable`.
   */
  Ref = "@watch.ref",
  /**
   * Watch shallow changes
   *
   * Akin to `@observable.shallow`.
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
 * `@watch` by default unwraps boxed observables, arrays, sets, and maps — meaning it uses shallow comparison.
 * If you don't want this behavior, use `@watch.ref` instead.
 *
 * - `@observable` (and its variants) are automatically assumed to be `@watched`, unless `@unwatch` is specified.
 * - `@computed` (and its variants) are not watched unless `@watch` or `@watch.ref` is specified.\
 *   A computed value derives from other state, and a change to that state is detected where the state is watched.
 * - `@nested` (and its variants) are considered `@watched` unless `@unwatch` is specified.
 * - If `@watch` and `@watch.ref` are specified for the same key (in the same inheritance chain),\
 *   the last annotation prevails.
 *
 * @function
 */
export const watch = Object.freeze(
  Object.assign(createWatch, {
    /**
     * Annotation for watching values with identity comparison
     *
     * It has no effect when combined with `@nested`.
     *
     * @function
     */
    ref: createWatchRef,
  })
);

/**
 * Annotation for unwatching changes to a property and a getter
 *
 * When used as an annotation:
 * - Combine with `@observable` or `@nested` (and their variants) to stop watching changes.\
 *   `@computed` needs none, as it is not watched unless `@watch` is specified.
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
 *
 * @function
 */
export const unwatch: typeof runInUnwatch & typeof createUnwatch = (...args: any[]) => {
  if (args.length === 1 && typeof args[0] === "function") {
    return runInUnwatch(args[0]);
  }
  return createUnwatch(...(args as Parameters<typeof createUnwatch>));
};

const watcherKey = Symbol("watcher");
const internalToken = Symbol("watcher.internal");

/**
 * Watcher for tracking changes to observable properties
 *
 * - Automatically tracks `@observable` properties
 * - Supports `@watch` and `@watch.ref` annotations for what `@observable` does not cover, such as `@computed` properties
 * - Can track nested objects
 * - Provides change detection at both property and path levels
 * - Can be temporarily disabled via `unwatch()`
 */
export class Watcher {
  readonly id = randomId();
  readonly #assumeChanged = observable.box(false);
  readonly #changedTick = observable.box(0n);
  readonly #changedKeys = observable.set<KeyPath>();
  /** Keys claimed by an earlier annotation pass, which the later ones skip */
  readonly #processedKeys = new Set<string>();
  readonly #nestedFetcher: StandardNestedFetcher<Watcher>;

  /**
   * Get a watcher instance for the target object.
   *
   * @remarks
   * - Returns existing instance if one exists for the target
   * - Creates new instance if none exists
   * - Instances are cached, and garbage collected with the target only if everything they observe is too
   *
   * @throws `TypeError` if the target is not an object.
   */
  static get<T extends object>(target: T): Watcher {
    const watcher = this.getSafe(target);
    if (!watcher) throw new TypeError("target: Expected an object");
    return watcher;
  }

  /**
   * Get a watcher instance for the target object.
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
   * The total number of changes processed
   *
   * Observe this value to react to changes.
   *
   * @remarks
   * - Incremented for each change and each affected key
   * - Not affected by assumeChanged()
   * - Reset to 0 when reset() is called
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
   * @remarks
   * - Does not include keys of nested objects
   * - Cleared when reset() is called
   * - Updated when properties are modified
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
        result.add(KeyPath.build(entry.keyPath, changedKeyPath));
      }
    }
    return result;
  }

  /** Nested watchers */
  get nested() {
    return this.#nestedFetcher.dataMap;
  }

  /**
   * Reset the changed state
   *
   * @remarks
   * - Clears all changed keys
   * - Resets changedTick to 0
   * - Clears assumeChanged flag
   * - Resets all nested watchers
   */
  @action
  reset = () => {
    this.#changedKeys.clear();
    this.#changedTick.set(0n);
    this.#assumeChanged.set(false);

    for (const entry of this.#nestedFetcher) {
      entry.data.reset();
    }
  };

  /**
   * Assume some changes have been made
   *
   * It only changes {@link changed} to true and does not increment {@link changedTick}.
   */
  @action
  assumeChanged = () => {
    if (!Watcher.isWatching) return;
    this.#assumeChanged.set(true);
  };

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
   * Process MobX's `@observable` annotations
   *
   * `@computed` ones are watched only with `@watch`, as {@link watch} explains.
   */
  #processMobxAnnotations(target: object) {
    for (const [key, getValue] of getMobxObservableAnnotations(target)) {
      if (typeof key !== "string") continue; // symbol and number keys are not supported
      if (this.#processedKeys.has(key)) continue;
      this.#processedKeys.add(key);

      reaction(
        () => shallowReadValue(getValue()),
        () => this.#didChange(KeyPath.build(key))
      );
    }
  }

  /**
   * Process `@nested` annotations
   */
  #processNestedAnnotations(target: object) {
    // Snapshot: a key this pass claims still has to block the later passes, but not its own next member
    const processedKeys = new Set(this.#processedKeys);
    for (const { key, getValue, hoist } of getNestedAnnotations(target)) {
      if (typeof key !== "string") continue; // symbol and number keys are not supported
      if (processedKeys.has(key)) continue;
      this.#processedKeys.add(key);

      reaction(
        () => shallowReadValue(getValue()),
        () => (hoist ? this.#incrementChangedTick() : this.#didChange(KeyPath.build(key)))
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
   *
   * @remarks
   * Annotations come one per annotated member, and two members can spell one key -- same-named private members of
   * a parent and a child class do. Each needs its own reaction, so the keys the earlier passes claimed are read
   * from a snapshot taken here: a key this pass takes must not make the next member of that key skip itself.
   */
  #processWatchAnnotations(target: object) {
    const processor = getAnnotationProcessor(target);
    if (!processor) return;

    const members = processor.getPropertyLikeMembers(watchKey);
    if (!members) return;

    // Snapshot: a key this pass claims still has to block the later passes, but not its own next member
    const processedKeys = new Set(this.#processedKeys);
    for (const member of members.values()) {
      const key = member.propertyKey;
      if (typeof key !== "string") continue; // symbol and number keys are not supported
      if (processedKeys.has(key)) continue;
      this.#processedKeys.add(key);

      const isShallow = member.data.at(-1) === WatchMode.Shallow; // Last annotation prevails
      // The member's own accessor comes first: it reaches a private member, which no key of `target` names
      const getValue = member.get ?? (() => (target as any)[key]);

      reaction(
        () => (isShallow ? shallowReadValue(getValue()) : getValue()),
        () => this.#didChange(KeyPath.build(key))
      );
    }
  }

  /**
   * Process `@unwatch` annotations
   *
   * Every member spelling the key is unwatched, as the later passes skip the key itself.
   */
  #processUnwatchAnnotations(target: object) {
    const processor = getAnnotationProcessor(target);
    if (!processor) return;

    const members = processor.getPropertyLikeMembers(unwatchKey);
    if (!members) return;

    for (const { propertyKey } of members.values()) {
      if (typeof propertyKey !== "string") continue; // symbol and number keys are not supported
      this.#processedKeys.add(propertyKey);
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
