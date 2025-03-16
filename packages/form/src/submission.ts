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
   *
   * @returns `true` if submission succeeded, `false` if failed or aborted
   */
  async exec() {
    this.#abortCtrl?.abort();
    const abortCtrl = new AbortController();
    this.#abortCtrl = abortCtrl;

    runInAction(() => {
      this.#isRunning.set(true);

      try {
        for (const handler of this.#handlers.willSubmit) {
          handler();
        }
      } catch (e) {
        console.warn(e);
      }
    });

    let succeed = true;
    try {
      for (const handler of this.#handlers.submit) {
        // Serialized
        if (!(await handler(abortCtrl.signal))) {
          succeed = false;
          break;
        }
      }
    } catch (e) {
      succeed = false;
      console.error(e);
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
    /** Called before submission starts */
    willSubmit: () => void;
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
     * @param succeed - `true` if submission succeeded, `false` if failed or aborted
     */
    didSubmit: (succeed: boolean) => void;
  };
}
