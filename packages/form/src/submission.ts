import { observable, runInAction } from "mobx";

/**
 * Manages form submission lifecycle and handlers
 *
 * Key features:
 * - Handles submission lifecycle (`willSubmit` -> `submit` -> `didSubmit`)
 * - Executes handlers in registration order
 * - Supports cancellation of in-progress submissions
 * - Tracks submission state
 */
export class Submission {
  readonly #isRunning = observable.box(false);
  readonly #handlers: {
    readonly [K in keyof Submission.Handlers]: Set<Submission.Handlers[K]>;
  } = {
    willSubmit: new Set(),
    submit: new Set(),
    didSubmit: new Set(),
  };
  #abortCtrl: AbortController | null = null;

  /** Whether the submission is running */
  get isRunning() {
    return this.#isRunning.get();
  }

  /**
   * Add a handler for submission events
   *
   * @returns Function to remove the handler
   */
  addHandler<K extends keyof Submission.Handlers>(event: K, handler: Submission.Handlers[K]) {
    this.#handlers[event].add(handler);
    return (): void => void this.#handlers[event].delete(handler);
  }

  /**
   * Execute the submission process
   *
   * @remarks
   * - Cancels any in-progress submission
   * - Executes handlers in order
   * - `submit` handlers are executed serially
   * - Aborts if any `submit` handler returns false
   * - Handles exceptions in all phases
   * - A cancelled submission invokes no further `willSubmit`/`submit` handlers and resolves `false`
   *   without notifying `didSubmit` handlers, leaving {@link isRunning} and `didSubmit` to the newer submission
   *
   * @returns `true` if submission succeeded, `false` if failed or aborted
   */
  async exec(): Promise<boolean> {
    this.#abortCtrl?.abort();
    const abortCtrl = new AbortController();
    this.#abortCtrl = abortCtrl;
    const { signal } = abortCtrl;

    let succeed = true;

    runInAction(() => {
      this.#isRunning.set(true);
    });

    try {
      for (const handler of this.#handlers.willSubmit) {
        if (signal.aborted || !(await handler(signal))) {
          succeed = false;
          break;
        }
      }
    } catch (e) {
      succeed = false;
      console.error(e);
    }

    if (succeed) {
      try {
        for (const handler of this.#handlers.submit) {
          // Serialized
          if (signal.aborted || !(await handler(signal))) {
            succeed = false;
            break;
          }
        }
      } catch (e) {
        succeed = false;
        console.error(e);
      }
    }

    // An aborted run never succeeds, even if its handlers ignored the signal
    // or it was aborted after its last handler settled
    if (signal.aborted) {
      succeed = false;
    }

    // Only the latest run owns the shared state and reports the outcome. A superseded run leaves
    // isRunning, the controller and didSubmit to the latest run.
    // An aborted run is never the current one, so this also covers cancellation.
    if (this.#abortCtrl !== abortCtrl) {
      return succeed;
    }

    this.#abortCtrl = null;
    runInAction(() => {
      this.#isRunning.set(false);

      try {
        for (const handler of this.#handlers.didSubmit) {
          handler(succeed);
        }
      } catch (e) {
        console.warn(e);
      }
    });

    return succeed;
  }
}

export namespace Submission {
  /** @inline */
  export type Handlers = {
    /**
     * Called before submission starts
     * @param abortSignal - Abort signal for the submission
     * @returns `true` to continue submission, `false` to cancel submission
     */
    willSubmit: (abortSignal: AbortSignal) => Promise<boolean>;
    /**
     * Async handler that perform the submission (serialized)
     *
     * @param abortSignal - Abort signal for the submission
     * @returns `true` if submission succeeded, `false` if failed or aborted
     */
    submit: (abortSignal: AbortSignal) => Promise<boolean>;
    /**
     * Called after submission completes
     *
     * Not called for a submission cancelled by a newer one; the newer submission reports the outcome instead.
     *
     * @param succeed - `true` if submission succeeded, `false` if failed
     */
    didSubmit: (succeed: boolean) => void;
  };
}
