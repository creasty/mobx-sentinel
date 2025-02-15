import { action, comparer, makeObservable, observable, runInAction } from "mobx";
import { ErrorMap, FormValidatorResult, toErrorMap } from "./error";

const validatorKey = Symbol("validator");
const internalToken = Symbol("validator.internal");

export class Validator {
  readonly #errors = observable.map<string, string[]>([], { equals: comparer.structural });
  readonly #state = observable.box<Validator.JobState>("idle");
  #nextJobRequested = false;
  #timerId: number | null = null;
  #abortCtrl: AbortController | null = null;
  readonly #handlers = new Set<Validator.Handler>();

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
      validator = new this(internalToken);
      Object.defineProperty(target, validatorKey, { value: validator });
    }
    return validator;
  }

  private constructor(token: symbol) {
    if (token !== internalToken) {
      throw new Error("private constructor");
    }

    makeObservable(this);
  }

  get errors(): ErrorMap {
    return this.#errors;
  }

  get state() {
    return this.#state.get();
  }

  addHandler(handler: Validator.Handler) {
    this.#handlers.add(handler);
    return () => void this.#handlers.delete(handler);
  }

  @action
  reset() {
    this.#resetTimer();
    this.#abortCtrl?.abort();
    this.#errors.clear();
    this.#state.set("idle");
  }

  request(opt: Validator.RunOptions) {
    if (opt.force) {
      this.#runJob(opt);
      return;
    }

    switch (this.state) {
      case "idle": {
        this.#transitionToEnqueued(opt);
        break;
      }
      case "enqueued": {
        this.#resetTimer();
        this.#transitionToEnqueued(opt);
        break;
      }
      case "running": {
        this.#nextJobRequested = true;
        break;
      }
      case "scheduled": {
        this.#resetTimer();
        this.#transitionToScheduled(opt);
        break;
      }
    }
  }

  #transitionToEnqueued(opt: Validator.RunOptions) {
    runInAction(() => {
      this.#state.set("enqueued");
    });
    this.#timerId = +setTimeout(() => {
      this.#runJob(opt);
    }, opt.enqueueDelayMs);
  }

  #transitionToScheduled(opt: Validator.RunOptions) {
    runInAction(() => {
      this.#state.set("scheduled");
    });
    this.#timerId = +setTimeout(() => {
      this.#runJob(opt);
    }, opt.scheduleDelayMs);
  }

  #resetTimer(): void {
    if (this.#timerId) {
      clearTimeout(this.#timerId);
      this.#timerId = null;
    }
  }

  async #runJob(opt: Validator.RunOptions) {
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
      for (const handler of this.#handlers) {
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
        this.#transitionToScheduled(opt);
      } else {
        this.#state.set("idle");
      }
    });
  }
}

export namespace Validator {
  export type JobState = "idle" | "enqueued" | "running" | "scheduled";

  export type RunOptions = {
    force: boolean;
    enqueueDelayMs: number;
    scheduleDelayMs: number;
  };

  export type Handler<T = any> = (abortSignal: AbortSignal) => Promise<FormValidatorResult<T>>;
}
