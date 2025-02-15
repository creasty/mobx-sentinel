import { action, comparer, computed, makeObservable, observable, reaction, runInAction } from "mobx";
import { ValidationError, ValidationErrorsBuilder } from "./error";
import { Watcher } from "./watcher";

const validatorKey = Symbol("validator");
const internalToken = Symbol("validator.internal");
const defaultErrorGroupKey = Symbol("validator.defaultErrorGroupKey");

export function makeValidatable<T extends object>(target: T, handler: Validator.ReactiveHandler<T>) {
  const validator = Validator.get(target);
  validator.addReactiveHandler(handler);
}

export class Validator<T> {
  readonly watcher: Watcher;
  readonly #errors = observable.map<symbol, ReadonlyArray<ValidationError>>([], { equals: comparer.structural });

  // Async handler
  enqueueDelayMs = 100;
  scheduleDelayMs = 300;
  readonly #asyncHandlers = new Set<Validator.AsyncHandler<T>>();
  readonly #jobState = observable.box<Validator.JobState>("idle");
  #nextJobRequested = false;
  #jobTimerId: number | null = null;
  #abortCtrl: AbortController | null = null;

  // Reactive handler
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

    makeObservable(this);
    this.watcher = Watcher.get(target);

    reaction(
      () => this.watcher.changedTick,
      () => this.request()
    );
  }

  @computed.struct
  get errors(): Validator.KeyPathErrorMap {
    const result = new Map<string, string[]>();
    for (const errors of this.#errors.values()) {
      for (const error of errors) {
        let list = result.get(error.keyPath);
        if (!list) {
          list = [];
          result.set(error.keyPath, list);
        }
        list.push(error.message);
      }
    }
    return result;
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
  @computed
  get invalidKeys(): ReadonlySet<string> {
    const seenKeys = new Set<string>();
    for (const errors of this.#errors.values()) {
      for (const error of errors) {
        seenKeys.add(error.key);
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
  @computed
  get invalidKeyPaths(): ReadonlySet<string> {
    const seenKeyPaths = new Set<string>();
    for (const errors of this.#errors.values()) {
      for (const error of errors) {
        seenKeyPaths.add(error.keyPath);
      }
    }
    for (const [parentKeyPath, validator] of this.nested) {
      for (const keyPath of validator.invalidKeyPaths) {
        seenKeyPaths.add(`${parentKeyPath}.${keyPath}`);
      }
    }
    return Object.freeze(seenKeyPaths);
  }

  get jobState() {
    return this.#jobState.get();
  }

  /** Whether the validator is computing errors */
  @computed
  get isValidating() {
    return this.jobState !== "idle" || this.#reactionTimerIds.size > 0;
  }

  /** Nested validators */
  @computed.struct
  get nested() {
    const result = new Map<string, Validator<any>>();
    for (const [key, nested] of this.watcher.nested) {
      const validator = Validator.getSafe(nested.value);
      if (validator) {
        result.set(key, validator);
      }
    }
    return result;
  }

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

  addReactiveHandler(handler: Validator.ReactiveHandler<T>) {
    const key = Symbol();

    const dispose = reaction(
      () => {
        const builder = new ValidationErrorsBuilder();
        handler(builder);
        return ValidationErrorsBuilder.build(builder);
      },
      (result) => {
        if (result.length > 0) {
          this.#errors.set(key, result);
        } else {
          this.#errors.delete(key);
        }
      },
      {
        scheduler: (fn) => {
          let timerId = this.#reactionTimerIds.get(key);
          if (timerId) {
            clearTimeout(timerId);
          }
          timerId = +setTimeout(fn, this.reactionDelayMs);
          this.#reactionTimerIds.set(key, timerId);
        },
      }
    );

    return () => {
      dispose();

      const timerId = this.#reactionTimerIds.get(key);
      if (timerId) {
        clearTimeout(timerId);
        this.#reactionTimerIds.delete(key);
      }
    };
  }

  addAsyncHandler(handler: Validator.AsyncHandler<T>) {
    this.#asyncHandlers.add(handler);
    return () => void this.#asyncHandlers.delete(handler);
  }

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

    const builder = new ValidationErrorsBuilder();
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
        try {
          this.#errors.set(defaultErrorGroupKey, ValidationErrorsBuilder.build(builder));
        } catch (e) {
          console.warn(e);
        }
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
  export type KeyPathErrorMap = ReadonlyMap<string, ReadonlyArray<string>>;
  export type JobState = "idle" | "enqueued" | "running" | "scheduled";
  export type AsyncHandler<T> = (builder: ValidationErrorsBuilder<T>, abortSignal: AbortSignal) => Promise<void>;
  export type ReactiveHandler<T> = (builder: ValidationErrorsBuilder<T>) => void;
}
