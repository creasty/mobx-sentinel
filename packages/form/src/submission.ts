import { observable, runInAction } from "mobx";

/**
 * Manages form submission lifecycle and handlers
 *
 * Key features:
 * - Handles submission lifecycle (`willSubmit` -> `submit` -> `didSubmit`)
 * - Executes `willSubmit` and `submit` handlers serially, in registration order
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
   * - Cancels any in-progress submission by aborting its `AbortSignal`
   * - Executes `willSubmit` handlers, then `submit` handlers, serially in registration order
   * - Fails, skipping the remaining `willSubmit`/`submit` handlers, if any of them returns `false` or throws
   * - Handles exceptions in all phases
   * - Calls `didSubmit` handlers once with the outcome
   * - A cancelled submission invokes no further `willSubmit`/`submit` handlers and resolves `false`
   *   without notifying `didSubmit` handlers, leaving {@link isRunning} and `didSubmit` to the newer submission.
   *   Handlers do not need to return `false` for this; it holds whatever they return.
   *
   * @returns `true` if submission succeeded, `false` if failed or cancelled
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
     * Called before submission starts, to veto or prepare the submission (or to log it)
     *
     * Handlers run serially, in registration order.
     *
     * @param abortSignal - Abort signal for the submission, aborted when a newer submission cancels it
     * @returns `true` to continue submission, `false` to stop it (the submission fails and `didSubmit` receives `false`)
     */
    willSubmit: (abortSignal: AbortSignal) => Promise<boolean>;
    /**
     * Async handler that performs the submission (serialized)
     *
     * The return value reports whether the submission succeeded, even when no async work is involved
     * (e.g. `false` when the server rejects the data or a precondition does not hold).
     * It becomes the outcome `didSubmit` handlers receive (`true` only if every `submit` handler returns `true`),
     * and a form resets itself only when it is `true`.
     *
     * Cancellation does not depend on it: a submission cancelled by a newer one invokes no further handlers
     * and resolves `false` whatever this returns. Pass `abortSignal` to async work (e.g. `fetch`) to cancel the work in flight,
     * and keep fallback or cleanup for the request in this handler (`try`/`catch`/`finally`).
     *
     * @param abortSignal - Abort signal for the submission, aborted when a newer submission cancels it
     * @returns `true` if submission succeeded, `false` if failed (the remaining `submit` handlers are skipped)
     */
    submit: (abortSignal: AbortSignal) => Promise<boolean>;
    /**
     * Called once with the outcome after a submission finishes
     *
     * Use it for what follows the submission, e.g. showing a toast, closing a modal or drawer,
     * syncing state that lives outside the form, logging, moving to the next UI state, or saving a snapshot.
     *
     * Not called for a submission cancelled by a newer one; the newer submission reports the outcome instead.
     *
     * It receives only the outcome. When the next step needs the submission's result (e.g. a created ID),
     * have a `submit` handler store it where this handler can read it.
     *
     * @param succeed - `true` if submission succeeded, `false` if failed
     */
    didSubmit: (succeed: boolean) => void;
  };
}
