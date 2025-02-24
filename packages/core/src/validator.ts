import { action, comparer, computed, makeObservable, observable, reaction, runInAction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { ValidationError, ValidationErrorMapBuilder } from "./error";
import { Watcher } from "./watcher";
import { StandardNestedFetcher } from "./nested";
import {
  KeyPath,
  KeyPathSelf,
  ReadonlyKeyPathMultiMap,
  buildKeyPath,
  getKeyPathAncestors,
  getRelativeKeyPath,
  isKeyPathSelf,
} from "./keyPath";

const validatorKey = Symbol("validator");
const internalToken = Symbol("validator.internal");
const defaultErrorGroupKey = Symbol("validator.defaultErrorGroupKey");

/**
 * Make a target object validatable
 *
 * It's just a shorthand of `Validator.get(target).addReactiveHandler(handler)`.
 *
 * If you're using `make(Auto)Observable`, make sure to call `makeValidatable`
 * after `make(Auto)Observable`.
 *
 * @returns A function to remove the handler
 */
export function makeValidatable<T extends object>(
  target: T,
  handler: Validator.ReactiveHandler<T>,
  opt?: Validator.HandlerOptions
) {
  return Validator.get(target).addReactiveHandler(handler, opt);
}

export class Validator<T> {
  readonly id = uuidV4();
  readonly #errors = observable.map<symbol, ReadonlyKeyPathMultiMap<ValidationError>>([], {
    equals: comparer.structural,
  });
  readonly #nestedFetcher: StandardNestedFetcher<Validator<any>>;

  // Async validation
  enqueueDelayMs = 100;
  scheduleDelayMs = 300;
  readonly #asyncHandlers = new Set<Validator.AsyncHandler<T>>();
  readonly #jobState = observable.box<Validator.JobState>("idle");
  #nextJobRequested = false;
  #jobTimerId: number | null = null;
  #abortCtrl: AbortController | null = null;

  // Reactive validation
  reactionDelayMs = 100;
  readonly #reactionTimerIds = observable.map<symbol, number>();

  /**
   * Get a validator for a target object
   *
   * @throws TypeError when the target is not an object.
   */
  static get<T extends object>(target: T): Validator<T> {
    const validator = this.getSafe(target);
    if (!validator) throw new TypeError("target: Expected an object");
    return validator;
  }

  /**
   * Get a validator for a target object
   *
   * Same as {@link Validator.get} but returns null instead of throwing an error.
   */
  static getSafe<T>(target: T): Validator<T> | null {
    if (!target || typeof target !== "object") {
      return null;
    }

    let validator: Validator<T> | null = (target as any)[validatorKey] ?? null;
    if (!validator) {
      validator = new this(internalToken, target);
      Object.defineProperty(target, validatorKey, { value: validator });
    }
    return validator;
  }

  private constructor(token: symbol, target: object) {
    if (token !== internalToken) {
      throw new Error("private constructor");
    }

    this.#nestedFetcher = new StandardNestedFetcher(target, (entry) => Validator.getSafe(entry.data));
    makeObservable(this);

    const watcher = Watcher.get(target);
    reaction(
      () => watcher.changedTick,
      () => this.request()
    );
  }

  /** Whether no errors are found */
  @computed
  get isValid() {
    return this.invalidKeyPathCount === 0;
  }

  /** The number of invalid keys */
  @computed
  get invalidKeyCount() {
    return this.invalidKeys.size;
  }

  /** The number of invalid keys */
  @computed.struct
  get invalidKeys(): ReadonlySet<KeyPath> {
    const seenKeys = new Set<KeyPath>();
    for (const errors of this.#errors.values()) {
      for (const [, error] of errors) {
        seenKeys.add(buildKeyPath(error.key));
      }
    }
    return Object.freeze(seenKeys);
  }

  /** The number of invalid key paths */
  @computed
  get invalidKeyPathCount() {
    return this.invalidKeyPaths.size;
  }

  /** The number of invalid key paths */
  @computed.struct
  get invalidKeyPaths(): ReadonlySet<KeyPath> {
    const result = new Set<KeyPath>();
    for (const errors of this.#errors.values()) {
      for (const [keyPath] of errors) {
        result.add(keyPath);
      }
    }
    for (const [keyPath, validator] of this.nested) {
      for (const relativeKeyPath of validator.invalidKeyPaths) {
        result.add(buildKeyPath(keyPath, relativeKeyPath));
      }
    }
    return Object.freeze(result);
  }

  /** Get the first error message (including nested objects) */
  @computed
  get firstErrorMessage() {
    for (const [, error] of this.findErrors(KeyPathSelf, true)) {
      return error.message;
    }
    return null;
  }

  /** Get error messages for the key path */
  getErrorMessages(keyPath: KeyPath, prefixMatch = false) {
    const result = new Set<string>();
    for (const [, error] of this.findErrors(keyPath, prefixMatch)) {
      result.add(error.message);
    }
    return result;
  }

  /** Check if the validator has errors for the key path */
  hasErrors(keyPath: KeyPath, prefixMatch = false) {
    for (const _ of this.findErrors(keyPath, prefixMatch)) {
      return true;
    }
    return false;
  }

  /** Find errors for the key path */
  *findErrors(searchKeyPath: KeyPath, prefixMatch = false): Generator<[keyPath: KeyPath, error: ValidationError]> {
    if (isKeyPathSelf(searchKeyPath)) {
      for (const errors of this.#errors.values()) {
        for (const [keyPath, error] of errors) {
          yield [keyPath, error];
        }
      }
      if (prefixMatch) {
        for (const [keyPath, validator] of this.nested) {
          for (const [relativeKeyPath, error] of validator.findErrors(KeyPathSelf, prefixMatch)) {
            yield [buildKeyPath(keyPath, relativeKeyPath), error];
          }
        }
      }
    } else {
      for (const errors of this.#errors.values()) {
        const iter = prefixMatch ? errors.findPrefix(searchKeyPath) : errors.findExact(searchKeyPath);
        for (const error of iter) {
          yield [error.keyPath, error];
        }
      }
      ancestorLoop: for (const ancestorKeyPath of getKeyPathAncestors(searchKeyPath, true)) {
        for (const entry of this.#nestedFetcher.getForKey(ancestorKeyPath)) {
          const childKeyPath =
            prefixMatch && entry.key !== entry.keyPath && getRelativeKeyPath(entry.keyPath, entry.key)
              ? KeyPathSelf
              : getRelativeKeyPath(searchKeyPath, entry.keyPath);
          if (!childKeyPath) continue;
          for (const [relativeKeyPath, error] of entry.data.findErrors(childKeyPath, prefixMatch)) {
            yield [buildKeyPath(entry.keyPath, relativeKeyPath), error];
          }
          break ancestorLoop;
        }
      }
    }
  }

  /** State of the async validation */
  get jobState() {
    return this.#jobState.get();
  }

  /**
   * State of the reactive validation
   *
   * The number of pending executions.
   */
  @computed
  get reactionState() {
    return this.#reactionTimerIds.size;
  }

  /** Whether the validator is computing errors */
  @computed
  get isValidating() {
    return this.jobState !== "idle" || this.#reactionTimerIds.size > 0;
  }

  /** Nested validators */
  get nested(): ReadonlyMap<KeyPath, Validator<any>> {
    return this.#nestedFetcher.dataMap;
  }

  /**
   * Reset the validator
   *
   * Use with caution.\
   * Since validation is reactive, errors won't reappear until you make some changes.
   */
  @action
  reset() {
    this.#resetJobTimer();
    this.#abortCtrl?.abort();
    this.#jobState.set("idle");

    for (const timerId of this.#reactionTimerIds.values()) {
      clearTimeout(timerId);
    }
    this.#reactionTimerIds.clear();

    this.#errors.clear();
  }

  /**
   * Update the errors immediately
   *
   * @returns A function to remove the errors
   */
  updateErrors(key: symbol, handler: Validator.InstantHandler<T>) {
    const builder = new ValidationErrorMapBuilder();
    handler(builder);
    const result = ValidationErrorMapBuilder.build(builder);
    if (result.size > 0) {
      this.#errors.set(key, result);
    } else {
      this.#errors.delete(key);
    }
    return () => {
      this.#errors.delete(key);
    };
  }

  /**
   * Add a reactive handler
   *
   * @returns A function to remove the handler
   */
  addReactiveHandler(handler: Validator.ReactiveHandler<T>, opt?: Validator.HandlerOptions) {
    const key = Symbol();
    let timerId: number | null = null;

    const dispose = reaction(
      () => {
        const builder = new ValidationErrorMapBuilder();
        handler(builder);
        return ValidationErrorMapBuilder.build(builder);
      },
      (result) => {
        this.#reactionTimerIds.delete(key);

        if (result.size > 0) {
          this.#errors.set(key, result);
        } else {
          this.#errors.delete(key);
        }
      },
      {
        fireImmediately: opt?.initialRun ?? true,
        scheduler: (fn) => {
          // NOTE: Reading timerId from this.#reactionTimerIds didn't work
          // because it always returns undefined for some reason.
          // To workaround this, we use a local variable.
          if (timerId) {
            clearTimeout(timerId);
          }
          timerId = +setTimeout(fn, this.reactionDelayMs);
          runInAction(() => {
            this.#reactionTimerIds.set(key, timerId!);
          });
        },
      }
    );

    return (): void => {
      dispose();

      const timerId = this.#reactionTimerIds.get(key);
      if (timerId) {
        clearTimeout(timerId);
        runInAction(() => {
          this.#reactionTimerIds.delete(key);
        });
      }
    };
  }

  /**
   * Add an async handler
   *
   * @returns A function to remove the handler
   */
  addAsyncHandler(handler: Validator.AsyncHandler<T>, opt?: Validator.HandlerOptions) {
    this.#asyncHandlers.add(handler);
    if (opt?.initialRun ?? true) this.request(); // TODO: Run only newly added handler
    return (): void => void this.#asyncHandlers.delete(handler);
  }

  /**
   * Request new async validation job to be executed
   */
  request(opt?: {
    /** Force the validator to be executed immediately */
    force?: boolean;
  }) {
    if (this.#asyncHandlers.size === 0) {
      return;
    }

    if (opt?.force) {
      this.#runJob();
      return;
    }

    switch (this.jobState) {
      case "idle": {
        this.#transitionToEnqueued();
        break;
      }
      case "enqueued": {
        this.#resetJobTimer();
        this.#transitionToEnqueued();
        break;
      }
      case "running": {
        this.#nextJobRequested = true;
        break;
      }
      case "scheduled": {
        this.#resetJobTimer();
        this.#transitionToScheduled();
        break;
      }
    }
  }

  #transitionToEnqueued() {
    runInAction(() => {
      this.#jobState.set("enqueued");
    });
    this.#jobTimerId = +setTimeout(() => {
      this.#runJob();
    }, this.enqueueDelayMs);
  }

  #transitionToScheduled() {
    runInAction(() => {
      this.#jobState.set("scheduled");
    });
    this.#jobTimerId = +setTimeout(() => {
      this.#runJob();
    }, this.scheduleDelayMs);
  }

  #resetJobTimer(): void {
    if (this.#jobTimerId) {
      clearTimeout(this.#jobTimerId);
      this.#jobTimerId = null;
    }
  }

  async #runJob() {
    this.#resetJobTimer();

    this.#abortCtrl?.abort();
    const abortCtrl = new AbortController();
    this.#abortCtrl = abortCtrl;

    runInAction(() => {
      this.#jobState.set("running");
    });

    const builder = new ValidationErrorMapBuilder();
    try {
      const promises = [];
      for (const handler of this.#asyncHandlers) {
        promises.push(handler(builder, abortCtrl.signal)); // Parallelized
      }
      await Promise.all(promises);
    } catch (e) {
      console.error(e);
    }
    this.#abortCtrl = null;

    runInAction(() => {
      if (builder.hasError) {
        this.#errors.set(defaultErrorGroupKey, ValidationErrorMapBuilder.build(builder));
      } else {
        this.#errors.delete(defaultErrorGroupKey);
      }

      if (this.#nextJobRequested) {
        this.#nextJobRequested = false;
        this.#transitionToScheduled();
      } else {
        this.#jobState.set("idle");
      }
    });
  }
}

export namespace Validator {
  /** State of the async validation */
  export type JobState = "idle" | "enqueued" | "running" | "scheduled";
  /** Async handler */
  export type AsyncHandler<T> = (builder: ValidationErrorMapBuilder<T>, abortSignal: AbortSignal) => Promise<void>;
  /** Reactive handler */
  export type ReactiveHandler<T> = (builder: ValidationErrorMapBuilder<T>) => void;
  /** Instant handler */
  export type InstantHandler<T> = (builder: ValidationErrorMapBuilder<T>) => void;
  /** Handler options */
  export type HandlerOptions = {
    /**
     * Whether to run the handler immediately
     * @default true
     */
    initialRun?: boolean;
  };
}
