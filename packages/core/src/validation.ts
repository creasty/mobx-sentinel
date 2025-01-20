import { action, comparer, makeObservable, observable, runInAction } from "mobx";
import { MaybeArray } from "./util";

type ErrorValue = MaybeArray<string | Error>;
export type FormValidationResult<T> = {
  [K in keyof T]?: ErrorValue | null;
};

type MutableErrorMap = Map<string, string[]>;
export type ErrorMap = ReadonlyMap<string, ReadonlyArray<string>>;

export class Validation {
  readonly #errors = observable.map<string, string[]>([], { equals: comparer.structural });
  readonly #state = observable.box<Validation.JobState>("idle");
  readonly #hasRun = observable.box(false);
  #nextJobRequested = false;
  #timerId: number | null = null;
  #abortCtrl: AbortController | null = null;
  readonly #handlers = new Set<Validation.Handler>();

  constructor() {
    makeObservable(this);
  }

  get errors(): ErrorMap {
    return this.#errors;
  }

  get state() {
    return this.#state.get();
  }

  get hasRun() {
    return this.#hasRun.get();
  }

  addHandler(handler: Validation.Handler) {
    this.#handlers.add(handler);
    return () => void this.#handlers.delete(handler);
  }

  @action
  reset() {
    this.#resetTimer();
    this.#abortCtrl?.abort();
    this.#errors.clear();
    this.#state.set("idle");
    this.#hasRun.set(false);
  }

  request(opt: Validation.RunOptions) {
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

  #transitionToEnqueued(opt: Validation.RunOptions) {
    runInAction(() => {
      this.#state.set("enqueued");
    });
    this.#timerId = +setTimeout(() => {
      this.#runJob(opt);
    }, opt.enqueueDelayMs);
  }

  #transitionToScheduled(opt: Validation.RunOptions) {
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

  async #runJob(opt: Validation.RunOptions) {
    this.#resetTimer();

    this.#abortCtrl?.abort();
    const abortCtrl = new AbortController();
    this.#abortCtrl = abortCtrl;

    runInAction(() => {
      this.#state.set("running");
      this.#hasRun.set(true);
    });

    let results: FormValidationResult<any>[] = [];
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

export namespace Validation {
  export type JobState = "idle" | "enqueued" | "running" | "scheduled";

  export type RunOptions = {
    force: boolean;
    enqueueDelayMs: number;
    scheduleDelayMs: number;
  };

  export type Handler<T = any> = (abortSignal: AbortSignal) => Promise<FormValidationResult<T>>;
}

export function toErrorMap(results: FormValidationResult<any>[]): MutableErrorMap {
  const map: MutableErrorMap = new Map();
  for (const result of results) {
    for (const [key, value] of Object.entries(result)) {
      if (!value) continue;
      const messages = getMessages(value);
      if (messages.length > 0) {
        let list = map.get(key);
        if (!list) {
          list = [];
          map.set(key, list);
        }
        list.push(...messages);
      }
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
