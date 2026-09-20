import {
  Reaction,
  _allowStateChanges,
  action,
  autorun,
  computed,
  makeObservable,
  observable,
  runInAction,
  transaction,
} from "mobx";
import { randomId } from "./randomId";
import { createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";
import { getMobxObservableAnnotations, isKeyPathKey, shallowReadValue, unwrapShallowContents } from "./mobx-utils";
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
    // The reactions of a Watcher run when the outermost transaction ends, so inside one the count has to go up and
    // down there as well, to tell what this function changed apart from what was changed around it. MobX runs the
    // reactions in the order they went stale, and an autorun created here takes the place of this moment in that
    // queue: everything MobX runs between these two autoruns went stale while the function was running.
    autorun(() => ++unwatchStackCount);
    ++unwatchStackCount;
    try {
      action();
    } finally {
      --unwatchStackCount;
      autorun(() => --unwatchStackCount);
    }
  });
}

/**
 * Watch the value of an expression and report every change of it
 *
 * The first reading is taken right away, so that watching starts when the watcher is created. MobX schedules the
 * first run of `reaction()` like any other one, which inside a transaction happens only when the transaction ends —
 * the changes made in between would silently become the baseline. Every later run is left to MobX as usual.
 */
function watchReaction<T>(expression: () => T, effect: (value: T) => void): void {
  let value: T;
  let tracked = false;
  // Named, rather than left to MobX: the name is optional only from mobx 6.13.4 on, and the library supports 6.11
  const reaction = new Reaction("Watcher", () => takeReading());

  function takeReading() {
    let changed = false;
    reaction.track(() => {
      // An expression is a derivation, not a place to change state, just as `reaction()` treats it
      const nextValue = _allowStateChanges(false, expression);
      changed = tracked && !Object.is(value, nextValue);
      value = nextValue;
    });
    // Outside track(), so that an expression that throws still leaves the reading behind it, as MobX does
    tracked = true;
    if (changed) effect(value);
  }

  takeReading();
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
 * - Only what the function itself changes goes undetected. Watching resumes as soon as it returns, so the changes\
 *   made around it are detected as usual, even when all of it happens in one transaction.
 *   ```typescript
 *   runInAction(() => {
 *     model.field1 = "value"; // Detected
 *     unwatch(() => {
 *       model.field2 = "value"; // Not detected
 *     });
 *     model.field3 = "value"; // Detected
 *   });
 *   ```
 * - Limitation: a watcher processes changes in batches, where all it can tell is when a key first changed in the\
 *   batch. A key that the function changes therefore goes undetected until the next batch — the rest of the\
 *   transaction, or longer under a custom `reactionScheduler`. A key changed before the function and again inside\
 *   it is detected.
 *
 * @function
 */
export const unwatch: typeof runInUnwatch & typeof createUnwatch = (...args: any[]) => {
  if (args.length === 1 && typeof args[0] === "function") {
    return runInUnwatch(args[0]);
  }
  return createUnwatch(...(args as Parameters<typeof createUnwatch>));
};

const registry = new WeakMap<object, Watcher>();
const internalToken = Symbol("watcher.internal");

/** Shared by every watcher, so that a change can be told apart from the ones recorded before it */
let changeSequence = 0n;

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
  readonly #changeProgress = observable.box(0n);
  readonly #changedKeys = observable.set<KeyPath>();
  /** Keys claimed by an earlier annotation pass, which the later ones skip */
  readonly #processedKeys = new Set<string>();
  readonly #unwatchedKeys = new Set<string>();
  readonly #unwatchedNestedKeyPaths = new Set<KeyPath>();
  readonly #nestedFetcher: StandardNestedFetcher<Watcher>;

  /**
   * Get a watcher instance for the target object.
   *
   * @remarks
   * - Returns existing instance if one exists for the target
   * - Creates new instance if none exists
   * - Instances are cached by the identity of the target, so an object inheriting from a watched one gets its own
   * - Nothing is written to the target, so frozen, sealed and non-extensible objects are supported
   * - Instances are garbage collected with the target only if everything they observe is too
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

    const watcher = registry.get(target);
    if (watcher) return watcher;

    try {
      // The constructor registers the instance itself, before building its reactions
      return new this(internalToken, target);
    } catch (e) {
      registry.delete(target); // Never leave a half-built watcher behind
      throw e;
    }
  }

  /**
   * Whether a change made right now would be detected
   *
   * `unwatch()` turns it off for as long as its function runs, and on again as soon as the function returns.
   *
   * @remarks
   * A watcher processes the changes of a transaction when the outermost one ends, so while it is doing that, this
   * reads false for the changes that `unwatch()` made in the transaction.
   */
  static get isWatching() {
    return unwatchStackCount === 0;
  }

  private constructor(token: symbol, target: object) {
    if (token !== internalToken) {
      throw new Error("private constructor");
    }

    // Register before building the reactions below, since they already read the watchers of nested objects:
    // a `@nested` reference cycle then finds this instance instead of creating a second watcher for the target.
    // Watcher.getSafe() removes it again when anything below throws.
    registry.set(target, this);
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
   * - Incremented for each `@nested` key that a change below it reaches
   * - Not affected by assumeChanged() on this watcher, although an assumed change of a nested watcher reaches it
   *   like a recorded one
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
   * How far the changes known to this watcher have progressed
   *
   * Each recorded change takes the next value of a sequence shared by all watchers, and a watcher keeps the highest
   * value it knows of, including the ones its nested watchers report. A parent watcher observes this value to learn
   * that something below it has changed.
   *
   * @remarks
   * - Only ever grows, so that resetting a nested watcher, or dropping one from a collection, cannot hide a change
   *   recorded elsewhere in the same transaction
   * - A value the watcher already holds is a change it has already counted, which is how a cycle of `@nested`
   *   references settles instead of the watchers incrementing each other without end
   * - An assumed change takes a value of its own, so that assumeChanged() reaches the parent too
   */
  get #progress(): bigint {
    return this.#changeProgress.get();
  }

  /**
   * The keys that have changed
   *
   * A best-effort debugging aid: use it to find out why a watcher reports a change, not as a record of what changed.
   * {@link changed} and {@link changedTick} are the contract; which key a change is filed under is not.
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
   * A best-effort debugging aid, like {@link changedKeys}: it tells you where a change came from, and two keys that
   * spell the same (private members of a class and of its subclass, for instance) are not told apart.
   *
   * @remarks
   * Keys of nested objects are included, except for the ones excluded with `@unwatch`.
   */
  @computed.struct
  get changedKeyPaths(): ReadonlySet<KeyPath> {
    const result = new Set(this.#changedKeys);
    for (const entry of this.#nestedFetcher) {
      if (this.#unwatchedNestedKeyPaths.has(entry.key)) continue;
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
    if (this.#assumeChanged.get()) return;
    this.#assumeChanged.set(true);
    // An assumed change reaches parent watchers like a recorded one, although it does not increment changedTick
    this.#changeProgress.set(++changeSequence);
  };

  /** Mark a key as changed */
  #didChange(key: KeyPath) {
    if (!Watcher.isWatching) return;
    runInAction(() => {
      this.#changedKeys.add(key);
      this.#recordChange();
    });
  }

  /**
   * Record a change of this watcher
   *
   * For when a key or key path of the target is changed.
   */
  #recordChange() {
    if (!Watcher.isWatching) return;
    runInAction(() => {
      this.#changeProgress.set(++changeSequence);
      this.#changedTick.set(this.#changedTick.get() + 1n);
    });
  }

  /**
   * Increment the changed tick
   *
   * For when the changes of a nested watcher reach this watcher. It deliberately records no change of its own, so
   * that the propagation cannot feed back into itself.
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

      watchReaction(
        () => shallowReadValue(getValue()),
        () => this.#didChange(KeyPath.build(key))
      );
    }
  }

  /**
   * Process `@nested` annotations
   */
  #processNestedAnnotations(target: object) {
    for (const { key, getValue, hoist } of getNestedAnnotations(target)) {
      if (typeof key !== "string") continue; // symbol and number keys are not supported
      if (this.#unwatchedKeys.has(key)) {
        this.#unwatchedNestedKeyPaths.add(hoist ? KeyPath.Self : KeyPath.build(key));
        continue;
      }
      // Not `#processedKeys`: several annotations can share a key — same-named private members of a parent and a
      // child class do — and each of them needs its own reactions
      this.#processedKeys.add(key);

      watchReaction(
        () => shallowReadValue(getValue()),
        () => (hoist ? this.#recordChange() : this.#didChange(KeyPath.build(key)))
      );
      let reachedProgress = 0n;
      watchReaction(
        () => {
          let progress = 0n;
          // Warning: Do not break out of this loop early.
          // We need to process all nested values to be reactive in future changes.
          for (const [subKey, value] of unwrapShallowContents(getValue())) {
            // The same keys the nested fetcher skips, so that the contents it ignores cannot flip `changed` either
            if (!isKeyPathKey(subKey)) continue;
            const nested = Watcher.getSafe(value);
            if (nested && nested.#progress > progress) progress = nested.#progress;
          }
          return progress;
        },
        (progress) => {
          // A lower value means a nested object left this key, or was reset; neither of them is a change
          if (progress <= reachedProgress) return;
          reachedProgress = progress;
          // A value this watcher already holds is its own change, brought back by a cycle of @nested references
          if (progress === this.#progress) return;
          runInAction(() => {
            if (progress > this.#progress) this.#changeProgress.set(progress);
          });
          this.#incrementChangedTick();
        }
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

    const members = processor.getPropertyLike(watchKey);
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

      watchReaction(
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

    const members = processor.getPropertyLike(unwatchKey);
    if (!members) return;

    for (const { propertyKey } of members.values()) {
      if (typeof propertyKey !== "string") continue; // symbol and number keys are not supported
      this.#processedKeys.add(propertyKey);
      this.#unwatchedKeys.add(propertyKey);
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
