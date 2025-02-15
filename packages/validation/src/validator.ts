import { action, comparer, computed, makeObservable, observable, runInAction } from "mobx";
import { ErrorMap, FormValidatorResult, toErrorMap } from "./error";
import { Watcher } from "./watcher";

const validatorKey = Symbol("validator");
const internalToken = Symbol("validator.internal");

export class Validator {
  enqueueDelayMs = 100;
  scheduleDelayMs = 300;
  readonly watcher: Watcher;
  readonly #errors = observable.map<string, string[]>([], { equals: comparer.structural });
  readonly #state = observable.box<Validator.JobState>("idle");
  #nextJobRequested = false;
  #timerId: number | null = null;
  #abortCtrl: AbortController | null = null;
  readonly #reactiveHandlers = new Set<Validator.ReactiveHandler>();
  readonly #asyncHandlers = new Set<Validator.AsyncHandler>();

  /**
   * Get a validator for a target object
   *
   * @throws TypeError when the target is not an object.
   */
  static get<T extends object>(target: T): Validator {
    const validator = this.getSafe(target);
    if (!validator) throw new TypeError("target: Expected an object");
    return validator;
  }

  /**
   * Get a validator for a target object
   *
   * Same as {@link Validator.get} but returns null instead of throwing an error.
   */
  static getSafe(target: any): Validator | null {
    if (!target || typeof target !== "object") {
      return null;
    }

    let validator: Validator | null = (target as any)[validatorKey] ?? null;
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

    this.watcher = Watcher.get(target);

    makeObservable(this);
  }

  get errors(): ErrorMap {
    return this.#errors;
  }

  get state() {
    return this.#state.get();
  }

  /**
   * Whether the validator is in validator state
   *
   * This is true when the validation state is not "idle".
   */
  @computed
  get isValidating() {
    return this.state !== "idle";
  }

  addReactiveHandler(handler: Validator.ReactiveHandler) {
    this.#reactiveHandlers.add(handler);
    return () => void this.#reactiveHandlers.delete(handler);
  }

  addAsyncHandler(handler: Validator.AsyncHandler) {
    this.#asyncHandlers.add(handler);
    return () => void this.#asyncHandlers.delete(handler);
  }

  @action
  reset() {
    this.#resetTimer();
    this.#abortCtrl?.abort();
    this.#errors.clear();
    this.#state.set("idle");
  }

  request(opt?: {
    /** Force the validator to be executed immediately */
    force?: boolean;
  }) {
    if (this.#reactiveHandlers.size > 0) {
      // TODO:
    }
    if (this.#asyncHandlers.size > 0) {
      if (opt?.force) {
        this.#runJob();
        return;
      }

      switch (this.state) {
        case "idle": {
          this.#transitionToEnqueued();
          break;
        }
        case "enqueued": {
          this.#resetTimer();
          this.#transitionToEnqueued();
          break;
        }
        case "running": {
          this.#nextJobRequested = true;
          break;
        }
        case "scheduled": {
          this.#resetTimer();
          this.#transitionToScheduled();
          break;
        }
      }
    }
  }

  #transitionToEnqueued() {
    runInAction(() => {
      this.#state.set("enqueued");
    });
    this.#timerId = +setTimeout(() => {
      this.#runJob();
    }, this.enqueueDelayMs);
  }

  #transitionToScheduled() {
    runInAction(() => {
      this.#state.set("scheduled");
    });
    this.#timerId = +setTimeout(() => {
      this.#runJob();
    }, this.scheduleDelayMs);
  }

  #resetTimer(): void {
    if (this.#timerId) {
      clearTimeout(this.#timerId);
      this.#timerId = null;
    }
  }

  async #runJob() {
    this.#resetTimer();

    this.#abortCtrl?.abort();
    const abortCtrl = new AbortController();
    this.#abortCtrl = abortCtrl;

    runInAction(() => {
      this.#state.set("running");
    });

    let results: FormValidatorResult<any>[] = [];
    try {
      const promises = [];
      for (const handler of this.#asyncHandlers) {
        promises.push(handler(abortCtrl.signal)); // Parallelized
      }
      results = await Promise.all(promises);
    } catch (e) {
      console.error(e);
    }
    this.#abortCtrl = null;

    runInAction(() => {
      if (results.length > 0) {
        try {
          this.#errors.replace(toErrorMap(results));
        } catch (e) {
          console.warn(e);
        }
      }

      if (this.#nextJobRequested) {
        this.#nextJobRequested = false;
        this.#transitionToScheduled();
      } else {
        this.#state.set("idle");
      }
    });
  }
}

export namespace Validator {
  export type JobState = "idle" | "enqueued" | "running" | "scheduled";
  export type AsyncHandler<T = any> = (abortSignal: AbortSignal) => Promise<FormValidatorResult<T>>;
  export type ReactiveHandler<T = any> = () => FormValidatorResult<T>;
}
