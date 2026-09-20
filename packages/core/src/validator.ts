import {
  action,
  comparer,
  computed,
  IEqualsComparer,
  makeObservable,
  observable,
  reaction,
  runInAction,
  when,
} from "mobx";
import { randomId } from "./randomId";
import { ValidationError, type ValidationErrorMapBuilder, ValidationErrorMapBuilderImpl } from "./error";
import { StandardNestedFetcher } from "./nested";
import { KeyPath, ReadonlyKeyPathMultiMap } from "./keyPath";
import { AsyncJob } from "./asyncJob";

const registry = new WeakMap<object, Validator<any>>();
const internalToken = Symbol("validator.internal");

/**
 * Add an async validation handler to a target object
 *
 * It's just a shorthand of:
 * ```typescript
 * Validator.get(target).addAsyncHandler(expr, handler, opt)
 * ```
 *
 * @remarks If you're using `make(Auto)Observable`, make sure to call `addValidation`
 * after `make(Auto)Observable`.
 *
 * @param target The target object
 * @param expr The expression to observe
 * @param handler The async handler to call when the expression changes
 * @param opt The handler options
 *
 * @returns A function to remove the handler
 */
export function addValidation<T extends object, Expr>(
  target: T,
  expr: () => Expr,
  handler: Validator.AsyncHandler<T, NoInfer<Expr>>,
  opt?: Validator.HandlerOptions<NoInfer<Expr>>
): () => void;

/**
 * Add a sync validation handler to a target object
 *
 * It's just a shorthand of:
 * ```typescript
 * Validator.get(target).addSyncHandler(handler, opt)
 * ```
 *
 * @remarks If you're using `make(Auto)Observable`, make sure to call `addValidation`
 * after `make(Auto)Observable`.
 *
 * @param target The target object
 * @param handler The sync handler containing observable expressions
 * @param opt The handler options
 *
 * @returns A function to remove the handler
 */
export function addValidation<T extends object>(
  target: T,
  handler: Validator.SyncHandler<T>,
  opt?: Validator.HandlerOptions
): () => void;

export function addValidation(target: object, ...args: any[]) {
  if (typeof args[0] === "function" && typeof args[1] === "function") {
    const [expr, handler, opt] = args;
    return Validator.get(target).addAsyncHandler(expr, handler, opt);
  }
  const [handler, opt] = args;
  return Validator.get(target).addSyncHandler(handler, opt);
}

/**
 * Validator for handling synchronous and asynchronous validations
 *
 * - Supports both sync and async validation handlers
 * - Tracks validation state (isValidating)
 * - Provides error access by key path
 * - Supports nested validators
 */
export class Validator<T> {
  static defaultDelayMs = 100;

  readonly id = randomId();
  readonly #errors = observable.map<symbol, ReadonlyKeyPathMultiMap<ValidationError>>([], {
    equals: comparer.structural,
  });
  readonly #nestedFetcher: StandardNestedFetcher<Validator<any>>;
  readonly #reactionTimerIds = observable.map<symbol, number>();
  readonly #reactionResets = new Map<symbol, () => void>();
  readonly #jobs = observable.set<AsyncJob<any>>();

  /**
   * Get a validator instance for the target object.
   *
   * @remarks
   * - Returns existing instance if one exists for the target
   * - Creates new instance if none exists
   * - Instances are cached by the identity of the target, so an object inheriting from a validated one gets its own
   * - Nothing is written to the target, so frozen, sealed and non-extensible objects are supported
   * - Instances are garbage collected with the target only if everything their handlers observe is too
   *
   * @throws `TypeError` if the target is not an object.
   */
  static get<T extends object>(target: T): Validator<T> {
    const validator = this.getSafe(target);
    if (!validator) throw new TypeError("target: Expected an object");
    return validator;
  }

  /**
   * Get a validator instance for the target object.
   *
   * Same as {@link Validator.get} but returns null instead of throwing an error.
   */
  static getSafe<T>(target: T): Validator<T> | null {
    if (!target || typeof target !== "object") {
      return null;
    }

    let validator: Validator<T> | null = registry.get(target) ?? null;
    if (!validator) {
      validator = new this(internalToken, target);
      registry.set(target, validator);
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

  /**
   * The keys that have errors
   *
   * Keys of nested objects are NOT included.
   */
  @computed.struct
  get invalidKeys(): ReadonlySet<KeyPath> {
    const seenKeys = new Set<KeyPath>();
    for (const errors of this.#errors.values()) {
      for (const [, error] of errors) {
        seenKeys.add(KeyPath.build(error.key));
      }
    }
    return Object.freeze(seenKeys);
  }

  /** The number of invalid key paths */
  @computed
  get invalidKeyPathCount() {
    return this.invalidKeyPaths.size;
  }

  /**
   * The key paths that have errors
   *
   * Keys of nested objects are included.
   */
  @computed.struct
  get invalidKeyPaths(): ReadonlySet<KeyPath> {
    const result = new Set<KeyPath>();
    for (const errors of this.#errors.values()) {
      for (const [keyPath] of errors) {
        result.add(keyPath);
      }
    }
    for (const entry of this.#nestedFetcher) {
      for (const relativeKeyPath of entry.data.invalidKeyPaths) {
        result.add(KeyPath.build(entry.keyPath, relativeKeyPath));
      }
    }
    return Object.freeze(result);
  }

  /** Get the first error message (including nested objects) */
  @computed
  get firstErrorMessage() {
    for (const [, error] of this.findErrors(KeyPath.Self, true)) {
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

  /**
   * Find errors for the key path
   *
   * - Can do exact or prefix matching
   * - Returns all errors that match the key path
   * - Searches nested validators, including hoisted ones, for the rest of the key path
   * - Includes errors of every nested validator below the key path when using prefix match
   */
  *findErrors(searchKeyPath: KeyPath, prefixMatch = false) {
    yield* this.#findErrors(searchKeyPath, prefixMatch, false);
  }

  /** Find errors for the key path */
  *#findErrors(
    searchKeyPath: KeyPath,
    prefixMatch: boolean,
    exact: boolean
  ): Generator<[keyPath: KeyPath, error: ValidationError]> {
    if (KeyPath.isSelf(searchKeyPath)) {
      if (exact) {
        for (const errors of this.#errors.values()) {
          for (const error of errors.findExact(KeyPath.Self)) {
            yield [KeyPath.Self, error];
          }
        }
      } else {
        for (const errors of this.#errors.values()) {
          for (const [keyPath, error] of errors) {
            yield [keyPath, error];
          }
        }
      }
      if (prefixMatch) {
        for (const entry of this.#nestedFetcher) {
          for (const [relativeKeyPath, error] of entry.data.#findErrors(KeyPath.Self, true, exact)) {
            yield [KeyPath.build(entry.keyPath, relativeKeyPath), error];
          }
        }
      } else if (!exact) {
        for (const entry of this.#nestedFetcher) {
          const isSelf = entry.key === KeyPath.Self;
          const isDirectChild = entry.keyPath === entry.key; // Ignores entries with subKey (like arrays)
          if (isSelf || isDirectChild) {
            for (const [relativeKeyPath, error] of entry.data.#findErrors(
              KeyPath.Self,
              false,
              !isSelf || !isDirectChild
            )) {
              yield [KeyPath.build(entry.keyPath, relativeKeyPath), error];
            }
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
      // Hoisted entries are fetched by a self path, which is never an ancestor of a non-self key path,
      // although their contents appear on this object
      const ancestorKeyPaths = new Set(KeyPath.getAncestors(searchKeyPath, true));
      ancestorKeyPaths.add(KeyPath.Self);
      for (const ancestorKeyPath of ancestorKeyPaths) {
        for (const entry of this.#nestedFetcher.getForKey(ancestorKeyPath)) {
          let childKeyPath = KeyPath.getRelative(searchKeyPath, entry.keyPath);
          if (!childKeyPath) {
            // The entry is below the searched key path (like an element of a searched array),
            // so all of its errors match the prefix
            if (!prefixMatch || !KeyPath.getRelative(entry.keyPath, searchKeyPath)) continue;
            childKeyPath = KeyPath.Self;
          }
          for (const [relativeKeyPath, error] of entry.data.#findErrors(childKeyPath, prefixMatch, exact)) {
            yield [KeyPath.build(entry.keyPath, relativeKeyPath), error];
          }
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

  /** Whether the validator is computing errors (including nested validators) */
  @computed
  get isValidating() {
    if (this.reactionState > 0 || this.asyncState > 0) {
      return true;
    }
    for (const entry of this.#nestedFetcher) {
      if (entry.data.isValidating) {
        return true;
      }
    }
    return false;
  }

  /**
   * Wait for the validation to complete
   *
   * A shorthand for:
   * ```typescript
   * await when(() => !validator.isValidating);
   * ```
   *
   * @param opt.signal Abort signal to stop waiting
   *
   * @returns A promise that resolves once {@link isValidating} is `false`,
   *   or rejects with the reason of the signal if it is aborted first
   *
   * @remarks
   * - Resolves right away if nothing is being validated
   * - Waits for nested validators as well, as {@link isValidating} includes them
   * - Deadlocks when awaited in an async handler of this validator or of a nested one:
   *   the handler is part of the validation it waits for
   */
  async waitForValidation(opt?: { signal?: AbortSignal }): Promise<void> {
    const signal = opt?.signal;
    if (signal?.aborted) throw signal.reason;

    // The signal is not passed to when(): it leaves its listener on the signal after resolving,
    // which would keep this validator alive as long as the signal
    const settled = when(() => !this.isValidating);
    const cancel = () => settled.cancel();
    signal?.addEventListener("abort", cancel);
    try {
      await settled;
    } catch (e) {
      cancel(); // Stop observing: when() keeps its reaction after isValidating throws
      throw signal?.aborted ? signal.reason : e;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  /**
   * Nested validators
   *
   * @remarks
   * A fresh iterator over the `@nested` entries, in annotation order and then in collection order. Each entry
   * carries the name of the annotated member in `key` (`"items"`), the address of the nested object in `keyPath`
   * (`"items.0"`) and its validator in `data`.\
   * Each read starts a new iteration, and an iterator is consumed once, so a second pass needs a second read.\
   * There is no lookup by name: entries are not unique by key path. To reach the validator of one nested object, go
   * through the property — `Validator.get(target.child)` is cached per subject, so it is the very instance yielded
   * here — or iterate and match `entry.key`, which is {@link KeyPath.Self} for a `@nested.hoist` member
   * rather than the name it is declared with. Errors are looked up by key path with {@link findErrors}, which
   * searches nested validators itself.
   */
  get nested(): Generator<StandardNestedFetcher.Entry<Validator<any>>, void, unknown> {
    return this.#nestedFetcher[Symbol.iterator]();
  }

  /**
   * Reset the validator
   *
   * Use with caution.\
   * Since validation is reactive, errors won't reappear until you make some changes.\
   * Running async validations are aborted, and their results are discarded.
   */
  @action
  reset = () => {
    this.#reactionTimerIds.clear();
    for (const reset of this.#reactionResets.values()) {
      reset();
    }

    for (const job of this.#jobs) {
      job.reset();
    }

    this.#errors.clear();
  };

  /**
   * Update the errors immediately
   *
   * @returns A function to remove the errors
   */
  @action
  updateErrors(key: symbol, handler: Validator.InstantHandler<T>) {
    const builder = new ValidationErrorMapBuilderImpl();
    handler(builder);
    const result = ValidationErrorMapBuilderImpl.build(builder);
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
   *
   * @remarks
   * - Handler runs immediately when added for initial validation
   * - Handler is called when observable expressions within it change
   * - Changes are throttled by default delay
   */
  addSyncHandler(handler: Validator.SyncHandler<T>, opt?: Validator.HandlerOptions) {
    const key = Symbol();
    return this.#createReaction({
      key,
      opt,
      expr: () => {
        const builder = new ValidationErrorMapBuilderImpl();
        handler(builder);
        return ValidationErrorMapBuilderImpl.build(builder);
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
   *
   * @remarks
   * - Handler runs immediately when added for initial validation
   * - Handler is called when the watched expression changes
   * - Changes are throttled by default delay
   * - Changes made while the handler is running are queued, not aborted:
   *   the latest value is validated after the running handler settles
   * - Provides abort signal, which is aborted when the validator is reset or the handler is removed;
   *   the result of an aborted run is discarded, so the errors it collected are not applied
   */
  @action
  addAsyncHandler<Expr>(
    expr: () => Expr,
    handler: Validator.AsyncHandler<T, NoInfer<Expr>>,
    opt?: Validator.HandlerOptions<NoInfer<Expr>>
  ) {
    const delayMs = opt?.delayMs ?? Validator.defaultDelayMs;

    const key = Symbol();
    const job = new AsyncJob<Expr>({
      handler: async (expr, abortSignal) => {
        const builder = new ValidationErrorMapBuilderImpl();
        try {
          await handler(expr, builder, abortSignal);
        } finally {
          // Discard the result of an aborted job (e.g. by reset() or disposal), so cleared errors do not come back
          if (!abortSignal.aborted) {
            runInAction(() => {
              const result = ValidationErrorMapBuilderImpl.build(builder);
              if (result.size > 0) {
                this.#errors.set(key, result);
              } else {
                this.#errors.delete(key);
              }
            });
          }
        }
      },
      scheduledRunDelayMs: delayMs,
    });
    this.#jobs.add(job);

    return this.#createReaction({
      key,
      opt,
      equals: opt?.equals,
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
    opt?: Validator.HandlerOptions<NoInfer<Expr>>;
    equals?: IEqualsComparer<NoInfer<Expr>>;
    expr: () => Expr;
    effect: (expr: NoInfer<Expr>) => void;
    dispose?: () => void;
  }) {
    const reactionDelayMs = args.opt?.delayMs ?? Validator.defaultDelayMs;
    let initialRun = args.opt?.initialRun ?? true;
    let evaluated = false; // Whether the last evaluation of the expression returned rather than threw
    let recorded = false; // Whether MobX holds a value of the expression, which the comparer compares against
    const equals = args.equals;

    const dispose = reaction(
      () => {
        recorded ||= evaluated; // MobX records the value of an evaluation that returned, after comparing it
        evaluated = false;
        const expr = args.expr();
        evaluated = true;
        return expr;
      },
      (expr) => {
        if (!initialRun && !this.#reactionTimerIds.has(args.key)) return; // In case of reset()
        initialRun = false;
        this.#reactionTimerIds.delete(args.key);
        // MobX calls the initial run's effect even if the expression threw, with an undefined value. Return without
        // applying it: MobX ends its first run only when the effect returns, and runs changes right away until then.
        if (!evaluated) return;
        args.effect(expr);
      },
      {
        // The comparer is skipped until a value is recorded: MobX leaves the value undefined when the initial
        // evaluation throws, and a comparer that fails on it would wedge the reaction, as MobX then never records one.
        equals: equals && ((a, b) => recorded && equals(a, b)),
        fireImmediately: args.opt?.initialRun ?? true,
        scheduler: (fn) => {
          // No need for clearing timer
          const timerId = +setTimeout(() => {
            try {
              fn();
            } finally {
              // MobX skips the effect, which removes the timer id, when the expression throws or its value is unchanged.
              // The id is compared, as the run may have scheduled the next one.
              runInAction(() => {
                if (this.#reactionTimerIds.get(args.key) === timerId) {
                  this.#reactionTimerIds.delete(args.key);
                }
              });
            }
          }, reactionDelayMs);
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
  export type HandlerOptions<Expr = unknown> = {
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
    /**
     * The equality comparer for the expression.
     *
     * Only effective for async handlers.
     */
    equals?: IEqualsComparer<Expr>;
  };
}
