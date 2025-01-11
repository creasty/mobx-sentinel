import { action, comparer, computed, makeObservable, observable, runInAction } from "mobx";
import { MaybeArray } from "./util";

type ErrorValue = MaybeArray<string | Error>;
export type FormValidationResult<T> = {
  [K in keyof T]?: ErrorValue | null;
};

type MutableErrorMap = Map<string, string[]>;
export type ErrorMap = ReadonlyMap<string, ReadonlyArray<string>>;

export class Validation {
  readonly #requestDelayMs: number;
  readonly #scheduleDelayMs: number;
  readonly #errors = observable.map<string, string[]>([], { equals: comparer.structural });
  readonly #isRunning = observable.box(false);
  readonly #scheduleTimerId = observable.box<number | null>(null);
  #abortCtrl: AbortController | null = null;

  constructor(args: { requestDelayMs: number; scheduleDelayMs: number }) {
    makeObservable(this);
    this.#requestDelayMs = args.requestDelayMs;
    this.#scheduleDelayMs = args.scheduleDelayMs;
  }

  get errors(): ErrorMap {
    return this.#errors;
  }

  get isRunning() {
    return this.#isRunning.get();
  }

  @computed
  get isScheduled() {
    return !!this.#scheduleTimerId.get();
  }

  @action
  request(executor: Validation.Executor, opt?: Validation.ExecutorOptions): Validation.Status {
    if (this.isRunning) {
      if (opt?.force) {
        this.#cancelScheduled();
        this.#exec(executor);
        return "forced";
      } else {
        this.#schedule(executor);
        return "scheduled";
      }
    } else {
      this.#schedule(executor);
      this.#execScheduled(this.#requestDelayMs);
      return "requested";
    }
  }

  @action
  reset() {
    this.#cancelScheduled();
    this.#abortCtrl?.abort();
    this.#errors.clear();
    this.#isRunning.set(false);
  }

  async #exec(executor: Validation.Executor): Promise<void> {
    this.#abortCtrl?.abort();
    const abortCtrl = new AbortController();
    this.#abortCtrl = abortCtrl;

    runInAction(() => {
      this.#isRunning.set(true);
    });

    let result: FormValidationResult<any> | undefined;
    try {
      result = await executor(abortCtrl.signal);
    } catch (e) {
      console.error(e);
    }
    this.#abortCtrl = null;

    runInAction(() => {
      this.#isRunning.set(false);
      if (result) {
        this.#errors.replace(toErrorMap(result));
      }
    });

    this.#execScheduled(this.#scheduleDelayMs);
  }

  #schedule(executor: Validation.Executor) {
    this.#cancelScheduled();
    this.#scheduledExecutor = executor;
  }
  #scheduledExecutor: Validation.Executor | null = null;

  #execScheduled(delayMs: number) {
    const executor = this.#scheduledExecutor;
    if (!executor) return;
    this.#scheduledExecutor = null;

    runInAction(() => {
      this.#cancelScheduled();
      const timerId = +setTimeout(
        action(() => {
          this.#scheduleTimerId.set(null);
          if (!this.isRunning) {
            this.#cancelScheduled();
            this.#exec(executor);
          }
        }),
        delayMs
      );
      this.#scheduleTimerId.set(timerId);
    });
  }

  #cancelScheduled() {
    const timerId = this.#scheduleTimerId.get();
    if (timerId) {
      clearTimeout(timerId);
      runInAction(() => {
        this.#scheduleTimerId.set(null);
      });
    }
  }
}

export namespace Validation {
  /**
   * The status of the validation request.
   *
   * - "requested": The validation request is pending.
   * - "scheduled": The validation request is scheduled to be executed after the current running validation is completed.
   * - "forced": The validation request is forced to be executed immediately.
   */
  export type Status = "requested" | "scheduled" | "forced";

  /**
   * The executor of the validation.
   */
  export type Executor<T = any> = (abortSignal: AbortSignal) => Promise<FormValidationResult<T>>;

  /**
   * The options for the validation request.
   */
  export type ExecutorOptions = {
    /** Force the validation to be executed immediately */
    force?: boolean;
  };
}

export function toErrorMap(result: FormValidationResult<any>): MutableErrorMap {
  const map: MutableErrorMap = new Map();
  for (const [key, value] of Object.entries(result)) {
    if (!value) continue;
    const messages = getMessages(value);
    if (messages.length > 0) {
      map.set(key, messages);
    }
  }
  return map;
}

function getMessages(target: ErrorValue): string[] {
  if (typeof target === "string") {
    return [target];
  }
  if (target instanceof Error) {
    return [target.message];
  }
  return target.flatMap((v) => getMessages(v));
}
