import { action, comparer, computed, IEqualsComparer, makeObservable, observable, reaction, runInAction } from "mobx";
import { v4 as uuidV4 } from "uuid";
import { ValidationError, ValidationErrorMapBuilder } from "./error";
import { StandardNestedFetcher } from "./nested";
import { KeyPath, ReadonlyKeyPathMultiMap } from "./keyPath";
import { AsyncJob } from "./asyncJob";

const validatorKey = Symbol("validator");
const internalToken = Symbol("validator.internal");

/**
 * Make a target object validatable
 *
 * It's just a shorthand of:
 * ```typescript
 * Validator.get(target).addAsyncHandler(expr, handler, opt)
 * ```
 *
 * @remarks If you're using `make(Auto)Observable`, make sure to call `makeValidatable`
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
  opt?: Validator.HandlerOptions<NoInfer<Expr>>
): () => void;

/**
 * Make a target object validatable
 *
 * It's just a shorthand of:
 * ```typescript
 * Validator.get(target).addSyncHandler(handler, opt)
 * ```
 *
 * @remarks If you're using `make(Auto)Observable`, make sure to call `makeValidatable`
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

  readonly id = uuidV4();
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
   * - Instances are cached and garbage collected with their targets
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
    for (const [keyPath, validator] of this.nested) {
      for (const relativeKeyPath of validator.invalidKeyPaths) {
        result.add(KeyPath.build(keyPath, relativeKeyPath));
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
   * - Includes errors from nested validators when using prefix match
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
        for (const [keyPath, validator] of this.nested) {
          for (const [relativeKeyPath, error] of validator.#findErrors(KeyPath.Self, true, exact)) {
            yield [KeyPath.build(keyPath, relativeKeyPath), error];
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
      ancestorLoop: for (const ancestorKeyPath of KeyPath.getAncestors(searchKeyPath, true)) {
        for (const entry of this.#nestedFetcher.getForKey(ancestorKeyPath)) {
          const childKeyPath =
            prefixMatch && entry.key !== entry.keyPath && KeyPath.getRelative(entry.keyPath, entry.key)
              ? KeyPath.Self
              : KeyPath.getRelative(searchKeyPath, entry.keyPath);
          if (!childKeyPath) continue;
          for (const [relativeKeyPath, error] of entry.data.#findErrors(childKeyPath, prefixMatch, exact)) {
            yield [KeyPath.build(entry.keyPath, relativeKeyPath), error];
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
   *
   * @remarks
   * - Handler runs immediately when added for initial validation
   * - Handler is called when the watched expression changes
   * - Changes are throttled by default delay
   * - Provides abort signal for cancellation
   * - Previous validations are aborted when new ones start
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
    opt?: Validator.HandlerOptions<NoInfer<Expr>>;
    expr: () => Expr;
    effect: (expr: NoInfer<Expr>) => void;
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
