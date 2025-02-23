import { action, comparer, computed, makeObservable, observable, reaction, runInAction } from "mobx";
import { ValidationError, ValidationErrorMapBuilder } from "./error";
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
import { AsyncJob } from "./asyncJob";

const validatorKey = Symbol("validator");
const internalToken = Symbol("validator.internal");

/**
 * Make a target object validatable
 *
 * It's just a shorthand of `Validator.get(target).addAsyncHandler(expr, handler)`.
 *
 * If you're using `make(Auto)Observable`, make sure to call `makeValidatable`
 * after `make(Auto)Observable`.
 *
 * @param target The target object
 * @param expr The expression to observe
 * @param handler The async handler to call when the expression changes
 * @param opt The handler options
 *
 * @returns A function to remove the handler
 */
export function makeValidatable<T extends object, Expr>(
  target: T,
  expr: () => Expr,
  handler: Validator.AsyncHandler<T, NoInfer<Expr>>,
  opt?: Validator.HandlerOptions
): () => void;

/**
 * Make a target object validatable
 *
 * It's just a shorthand of `Validator.get(target).addSyncHandler(handler)`.
 *
 * If you're using `make(Auto)Observable`, make sure to call `makeValidatable`
 * after `make(Auto)Observable`.
 *
 * @param target The target object
 * @param handler The sync handler containing observable expressions
 * @param opt The handler options
 *
 * @returns A function to remove the handler
 */
export function makeValidatable<T extends object>(
  target: T,
  handler: Validator.SyncHandler<T>,
  opt?: Validator.HandlerOptions
): () => void;

export function makeValidatable(target: object, ...args: any[]) {
  if (typeof args[0] === "function" && typeof args[1] === "function") {
    const [expr, handler, opt] = args;
    return Validator.get(target).addAsyncHandler(expr, handler, opt);
  }
  const [handler, opt] = args;
  return Validator.get(target).addSyncHandler(handler, opt);
}

export class Validator<T> {
  static defaultDelayMs = 100;

  readonly #errors = observable.map<symbol, ReadonlyKeyPathMultiMap<ValidationError>>([], {
    equals: comparer.structural,
  });
  readonly #nestedFetcher: StandardNestedFetcher<Validator<any>>;
  readonly #reactionTimerIds = observable.map<symbol, number>();
  readonly #reactionResets = new Map<symbol, () => void>();
  readonly #jobs = observable.set<AsyncJob<any>>();

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

  /**
   * The number of pending/running reactions.
   */
  @computed
  get reactionState() {
    return this.#reactionTimerIds.size;
  }

  /**
   * The number of pending/running async jobs.
   */
  @computed
  get asyncState() {
    let count = 0;
    for (const job of this.#jobs) {
      if (job.state !== "idle") {
        count++;
      }
    }
    return count;
  }

  /** Whether the validator is computing errors */
  @computed
  get isValidating() {
    return this.reactionState > 0 || this.asyncState > 0;
  }

  /** Nested validators */
  @computed.struct
  get nested(): ReadonlyMap<KeyPath, Validator<any>> {
    const result = new Map<KeyPath, Validator<any>>();
    for (const entry of this.#nestedFetcher) {
      result.set(entry.keyPath, entry.data);
    }
    return result;
  }

  /** Reset the validator */
  @action
  reset() {
    this.#reactionTimerIds.clear();
    for (const reset of this.#reactionResets.values()) {
      reset();
    }

    for (const job of this.#jobs) {
      job.reset();
    }

    this.#errors.clear();
  }

  /**
   * Update the errors immediately
   *
   * @returns A function to remove the errors
   */
  @action
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
   * Add a sync handler
   *
   * @param handler The sync handler containing observable expressions
   *
   * @returns A function to remove the handler
   */
  addSyncHandler(handler: Validator.SyncHandler<T>, opt?: Validator.HandlerOptions) {
    const key = Symbol();
    return this.#createReaction({
      key,
      opt,
      expr: () => {
        const builder = new ValidationErrorMapBuilder();
        handler(builder);
        return ValidationErrorMapBuilder.build(builder);
      },
      effect: (result) => {
        if (result.size > 0) {
          this.#errors.set(key, result);
        } else {
          this.#errors.delete(key);
        }
      },
    });
  }

  /**
   * Add an async handler
   *
   * @param expr The expression to observe
   * @param handler The async handler to call when the expression changes
   * @param opt The handler options
   *
   * @returns A function to remove the handler
   */
  @action
  addAsyncHandler<Expr>(
    expr: () => Expr,
    handler: Validator.AsyncHandler<T, NoInfer<Expr>>,
    opt?: Validator.HandlerOptions
  ) {
    const delayMs = opt?.delayMs ?? Validator.defaultDelayMs;

    const key = Symbol();
    const job = new AsyncJob<Expr>({
      handler: async (expr, abortSignal) => {
        const builder = new ValidationErrorMapBuilder();
        try {
          await handler(expr, builder, abortSignal);
        } finally {
          runInAction(() => {
            const result = ValidationErrorMapBuilder.build(builder);
            if (result.size > 0) {
              this.#errors.set(key, result);
            } else {
              this.#errors.delete(key);
            }
          });
        }
      },
      scheduledRunDelayMs: delayMs,
    });
    this.#jobs.add(job);

    return this.#createReaction({
      key,
      opt,
      expr,
      effect: (expr) => {
        job.request(expr);
      },
      dispose: () => {
        job.reset();
        this.#jobs.delete(job);
      },
    });
  }

  #createReaction<Expr>(args: {
    key: symbol;
    opt?: Validator.HandlerOptions;
    expr: () => Expr;
    effect: (expr: Expr) => void;
    dispose?: () => void;
  }) {
    const reactionDelayMs = args.opt?.delayMs ?? Validator.defaultDelayMs;
    let initialRun = args.opt?.initialRun ?? true;

    const dispose = reaction(
      args.expr,
      (expr) => {
        if (!initialRun && !this.#reactionTimerIds.has(args.key)) return; // In case of reset()
        initialRun = false;
        this.#reactionTimerIds.delete(args.key);
        args.effect(expr);
      },
      {
        fireImmediately: args.opt?.initialRun ?? true,
        scheduler: (fn) => {
          // No need for clearing timer
          const timerId = +setTimeout(fn, reactionDelayMs);
          runInAction(() => {
            this.#reactionTimerIds.set(args.key, timerId!);
          });
          this.#reactionResets.set(args.key, () => {
            clearTimeout(timerId);
            this.#reactionResets.delete(args.key);
            fn();
          });
        },
      }
    );

    return (): void => {
      dispose();
      const timerId = this.#reactionTimerIds.get(args.key);
      if (timerId) {
        clearTimeout(timerId);
      }
      runInAction(() => {
        this.#reactionTimerIds.delete(args.key);
        this.#reactionResets.delete(args.key);
        try {
          args.dispose?.();
        } finally {
          this.#errors.delete(args.key);
        }
      });
    };
  }
}

export namespace Validator {
  /**
   * Async handler
   *
   * @param expr The expression observed
   * @param builder The builder to build the errors
   * @param abortSignal The abort signal
   */
  export type AsyncHandler<T, Expr> = (
    expr: Expr,
    builder: ValidationErrorMapBuilder<T>,
    abortSignal: AbortSignal
  ) => Promise<void>;
  /**
   * Sync handler
   *
   * @param builder The builder to build the errors
   */
  export type SyncHandler<T> = (builder: ValidationErrorMapBuilder<T>) => void;
  /**
   * Instant handler
   *
   * @param builder The builder to build the errors
   */
  export type InstantHandler<T> = (builder: ValidationErrorMapBuilder<T>) => void;
  /** Handler options */
  export type HandlerOptions = {
    /**
     * Whether to run the handler immediately
     *
     * @default true
     */
    initialRun?: boolean;
    /**
     * Throttle reaction. [milliseconds]
     *
     * @default 100
     */
    delayMs?: number;
  };
}
