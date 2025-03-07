import { action, makeObservable, observable, runInAction } from "mobx";

const nullPayload = Symbol();

/**
 * Manages asynchronous job execution with state management and throttling
 *
 * Key features:
 * - Handles job state transitions
 * - Supports job cancellation and throttling
 * - Provides abort signals for running jobs
 * - Queues subsequent requests while running
 */
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
   *
   * @param payload Data to pass to the job handler
   * @param opt.force Force immediate execution, bypassing throttling
   *
   * @remarks
   * State transitions:
   * - `idle` -> `running`: Executes immediately
   * - `running` -> `scheduled`: Queues for later execution
   * - `scheduled` -> `scheduled`: No change
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

  /**
   * Reset the job state
   *
   * @remarks
   * - Cancels any scheduled execution
   * - Aborts running job if any
   * - Clears queued payload
   * - Returns to `idle` state
   */
  @action
  reset() {
    this.#resetJobTimer();
    this.#abortCtrl?.abort();
    this.#state.set("idle");
    this.#payload = nullPayload;
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
  /**
   * State of the job
   *
   * - `idle`: No job is running or scheduled
   * - `running`: Job is currently executing
   * - `scheduled`: Job is queued to run after delay
   */
  export type State = "idle" | "running" | "scheduled";

  /**
   * Handler for executing the job
   *
   * @param payload Data passed from request()
   * @param abortSignal Signal that is triggered when job is aborted
   */
  export type Handler<Payload> = (payload: Payload, abortSignal: AbortSignal) => Promise<void>;
}
