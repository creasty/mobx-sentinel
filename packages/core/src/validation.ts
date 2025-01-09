import { comparer, observable, runInAction } from "mobx";
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
  #abortCtrl: AbortController | null = null;

  constructor(args: { requestDelayMs: number; scheduleDelayMs: number }) {
    this.#requestDelayMs = args.requestDelayMs;
    this.#scheduleDelayMs = args.scheduleDelayMs;
  }

  get errors(): ErrorMap {
    return this.#errors;
  }

  get isRunning() {
    return this.#isRunning.get();
  }

  request(executor: Validation.Executor, opt?: Validation.ExecutorOptions): Validation.Status {
    if (this.isRunning) {
      if (opt?.force) {
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

  async #exec(executor: Validation.Executor): Promise<void> {
    this.#cancelScheduled();

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

    this.#cancelScheduled();
    this.#scheduleTimerId = setTimeout(() => {
      this.#scheduleTimerId = null;

      if (!this.isRunning) {
        this.#exec(executor);
      }
    }, delayMs);
  }

  #cancelScheduled() {
    if (!this.#scheduleTimerId) return;
    clearTimeout(this.#scheduleTimerId);
    this.#scheduleTimerId = null;
  }
  #scheduleTimerId: ReturnType<typeof setTimeout> | null = null;
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
