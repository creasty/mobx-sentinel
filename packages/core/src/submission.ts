import { observable, runInAction } from "mobx";

export class Submission {
  readonly #isRunning = observable.box(false);
  readonly #handlers: {
    readonly [K in keyof Submission.EventHandlers]: Set<Submission.EventHandlers[K]>;
  } = {
    willSubmit: new Set(),
    submit: new Set(),
    didSubmit: new Set(),
  };
  #abortCtrl: AbortController | null = null;

  get isRunning() {
    return this.#isRunning.get();
  }

  async exec() {
    this.#abortCtrl?.abort();
    const abortCtrl = new AbortController();
    this.#abortCtrl = abortCtrl;

    runInAction(() => {
      this.#isRunning.set(true);
    });

    try {
      for (const handler of this.#handlers.willSubmit) {
        handler();
      }
    } catch (e) {
      console.warn(e);
    }

    let succeed = true;
    try {
      for (const handler of this.#handlers.submit) {
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

  on<K extends keyof Submission.EventHandlers>(event: K, handler: Submission.EventHandlers[K]) {
    this.#handlers[event].add(handler);
    return () => void this.#handlers[event].delete(handler);
  }
}

export namespace Submission {
  export type EventHandlers = {
    willSubmit: () => void;
    submit: (abortSignal: AbortSignal) => Promise<boolean>;
    didSubmit: (succeed: boolean) => void;
  };
}
