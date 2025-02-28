import { action, makeObservable, observable, runInAction } from "mobx";

const nullPayload = Symbol();

export class AsyncJob<Payload> {
  readonly scheduledRunDelayMs: number;
  readonly #handler: AsyncJob.Handler<Payload>;
  readonly #state = observable.box<AsyncJob.State>("idle");
  #nextJobRequested = false;
  #jobTimerId: number | null = null;
  #abortCtrl: AbortController | null = null;
  #payload: Payload | typeof nullPayload = nullPayload;

  constructor(args: { handler: AsyncJob.Handler<Payload>; scheduledRunDelayMs: number }) {
    this.#handler = args.handler;
    this.scheduledRunDelayMs = args.scheduledRunDelayMs;

    makeObservable(this);
  }

  /** State of the job */
  get state() {
    return this.#state.get();
  }

  /**
   * Request new async job to be executed
   */
  request(
    payload: Payload,
    opt?: {
      /** Force the job to be executed immediately */
      force?: boolean;
    }
  ) {
    this.#payload = payload;

    if (opt?.force) {
      this.#runJob();
      return;
    }

    switch (this.state) {
      case "idle": {
        this.#runJob();
        break;
      }
      case "running": {
        this.#nextJobRequested = true;
        break;
      }
      case "scheduled": {
        this.#transitionToScheduled(); // Throttling
        break;
      }
    }
  }

  /** Reset the validator */
  @action
  reset() {
    this.#resetJobTimer();
    this.#abortCtrl?.abort();
    this.#state.set("idle");
  }

  #transitionToScheduled() {
    runInAction(() => {
      this.#state.set("scheduled");
    });
    this.#jobTimerId = +setTimeout(() => {
      this.#runJob();
    }, this.scheduledRunDelayMs);
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

    const payload = this.#payload;
    this.#payload = nullPayload;

    if (payload !== nullPayload) {
      runInAction(() => {
        this.#state.set("running");
      });

      try {
        await this.#handler(payload, abortCtrl.signal);
      } catch (e) {
        console.error(e);
      }
    }
    this.#abortCtrl = null;

    runInAction(() => {
      if (this.#nextJobRequested) {
        this.#nextJobRequested = false;
        this.#transitionToScheduled();
      } else {
        this.#state.set("idle");
      }
    });
  }
}

export namespace AsyncJob {
  /** State of the job */
  export type State = "idle" | "running" | "scheduled";
  /** Handler */
  export type Handler<Payload> = (payload: Payload, abortSignal: AbortSignal) => Promise<void>;
}
