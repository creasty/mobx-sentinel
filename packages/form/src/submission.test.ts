import { autorun, observable, reaction, runInAction } from "mobx";
import { Submission } from "./submission";
import { vi } from "vitest";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Flush pending microtasks without advancing any timer */
async function flushMicrotasks() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

/**
 * Register a `submit` handler whose result is controlled by the test.
 * Each call records its abort signal and waits for the corresponding deferred.
 */
function addControlledSubmitHandler(submission: Submission) {
  const calls: { signal: AbortSignal; result: Deferred<boolean> }[] = [];
  const dispose = submission.addHandler("submit", async (abortSignal) => {
    const result = deferred<boolean>();
    calls.push({ signal: abortSignal, result });
    return result.promise;
  });
  return { calls, dispose };
}

describe("Submission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("#exec", () => {
    it("executes handlers in order", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 1");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 1");
        return true;
      });
      submission.addHandler("didSubmit", () => {
        timeline.push("didSubmit 1");
      });
      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 2");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 2");
        return true;
      });
      submission.addHandler("didSubmit", () => {
        timeline.push("didSubmit 2");
      });

      await submission.exec();
      expect(timeline).toMatchInlineSnapshot(`
        [
          "willSubmit 1",
          "willSubmit 2",
          "submit 1",
          "submit 2",
          "didSubmit 1",
          "didSubmit 2",
        ]
      `);
    });

    it("sets isRunning flag during execution", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      autorun(() => {
        timeline.push(`isRunning: ${submission.isRunning}`);
      });

      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit");
        return true;
      });
      submission.addHandler("didSubmit", () => {
        timeline.push("didSubmit");
      });

      await submission.exec();
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isRunning: false",
          "isRunning: true",
          "willSubmit",
          "submit",
          "didSubmit",
          "isRunning: false",
        ]
      `);
    });

    it("processes willSubmit handlers serially regardless of timing", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 1 start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        timeline.push("willSubmit 1 end");
        return true;
      });
      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 2 start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        timeline.push("willSubmit 2 end");
        return true;
      });
      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 3 start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        timeline.push("willSubmit 3 end");
        return true;
      });

      await submission.exec();
      expect(timeline).toMatchInlineSnapshot(`
        [
          "willSubmit 1 start",
          "willSubmit 1 end",
          "willSubmit 2 start",
          "willSubmit 2 end",
          "willSubmit 3 start",
          "willSubmit 3 end",
        ]
      `);
    });

    it("processes submit handlers serially regardless of timing", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      submission.addHandler("submit", async () => {
        timeline.push("submit 1 start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        timeline.push("submit 1 end");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 2 start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        timeline.push("submit 2 end");
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 3 start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        timeline.push("submit 3 end");
        return true;
      });

      await submission.exec();
      expect(timeline).toMatchInlineSnapshot(`
        [
          "submit 1 start",
          "submit 1 end",
          "submit 2 start",
          "submit 2 end",
          "submit 3 start",
          "submit 3 end",
        ]
      `);
    });

    it("returns true when all submit handlers succeed", async () => {
      const submission = new Submission();

      submission.addHandler("submit", async () => true);
      submission.addHandler("submit", async () => true);

      const result = await submission.exec();
      expect(result).toBe(true);
    });

    it("returns false when any submit handler fails and stops execution", async () => {
      const submission = new Submission();
      const firstHandler = vi.fn(async () => true);
      const secondHandler = vi.fn(async () => false);
      const thirdHandler = vi.fn(async () => true);

      submission.addHandler("submit", firstHandler);
      submission.addHandler("submit", secondHandler);
      submission.addHandler("submit", thirdHandler);

      const result = await submission.exec();
      expect(result).toBe(false);
      expect(firstHandler).toHaveBeenCalled();
      expect(secondHandler).toHaveBeenCalled();
      expect(thirdHandler).not.toHaveBeenCalled();
    });

    it("skips submit handlers when willSubmit returns false", async () => {
      const submission = new Submission();
      const willSubmitHandler1 = vi.fn(async () => true);
      const willSubmitHandler2 = vi.fn(async () => false);
      const willSubmitHandler3 = vi.fn(async () => true);
      const submitHandler = vi.fn(async () => true);

      submission.addHandler("willSubmit", willSubmitHandler1);
      submission.addHandler("willSubmit", willSubmitHandler2);
      submission.addHandler("willSubmit", willSubmitHandler3);
      submission.addHandler("submit", submitHandler);

      const result = await submission.exec();
      expect(result).toBe(false);
      expect(willSubmitHandler1).toHaveBeenCalled();
      expect(willSubmitHandler2).toHaveBeenCalled();
      expect(willSubmitHandler3).not.toHaveBeenCalled();
      expect(submitHandler).not.toHaveBeenCalled();
    });

    it("handles errors in willSubmit handlers", async () => {
      const submission = new Submission();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      submission.addHandler("willSubmit", async () => {
        throw new Error("Test error");
      });

      const result = await submission.exec();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("handles errors in submit handlers", async () => {
      const submission = new Submission();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      submission.addHandler("submit", async () => {
        throw new Error("Test error");
      });

      const result = await submission.exec();
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("handles errors in didSubmit handlers", async () => {
      const submission = new Submission();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      submission.addHandler("didSubmit", () => {
        throw new Error("Test error");
      });

      const result = await submission.exec();
      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("aborts previous execution when called again", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      let counter = 0;
      submission.addHandler("submit", async (abortSignal) => {
        const localCounter = ++counter;
        timeline.push(`submit ${localCounter} start`);
        await new Promise((resolve) => {
          const timerId = setTimeout(() => {
            resolve(true);
            timeline.push(`submit ${localCounter} completed`);
          }, 100);
          abortSignal.onabort = () => {
            timeline.push(`submit ${localCounter} aborted`);
            clearTimeout(timerId);
          };
        });
        return true;
      });

      submission.exec();
      await submission.exec();

      expect(timeline).toMatchInlineSnapshot(`
        [
          "submit 1 start",
          "submit 1 aborted",
          "submit 2 start",
          "submit 2 completed",
        ]
      `);
    });
  });

  describe("#on", () => {
    it("returns cleanup function that removes the handler", async () => {
      const submission = new Submission();
      const handler = vi.fn();

      const dispose = submission.addHandler("willSubmit", handler);
      await submission.exec();
      expect(handler).toHaveBeenCalledTimes(1);

      dispose();
      await submission.exec();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("#isRunning", () => {
    it("is false on a fresh instance", () => {
      const submission = new Submission();
      expect(submission.isRunning).toBe(false);
    });

    it("becomes true synchronously when exec is called and false once it settles", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);

      const promise = submission.exec();
      expect(submission.isRunning).toBe(true);

      await flushMicrotasks();
      expect(submission.isRunning).toBe(true);

      calls[0].result.resolve(true);
      await promise;
      expect(submission.isRunning).toBe(false);
    });

    it("is already false when didSubmit handlers are invoked", async () => {
      const submission = new Submission();
      const observed: boolean[] = [];

      submission.addHandler("submit", async () => true);
      submission.addHandler("didSubmit", () => {
        observed.push(submission.isRunning);
      });

      await submission.exec();
      expect(observed).toEqual([false]);
    });

    it("notifies a reaction with true then false for a single run", async () => {
      const submission = new Submission();
      const seen: boolean[] = [];
      const dispose = reaction(
        () => submission.isRunning,
        (isRunning) => seen.push(isRunning)
      );

      submission.addHandler("submit", async () => true);
      await submission.exec();
      expect(seen).toEqual([true, false]);

      await submission.exec();
      expect(seen).toEqual([true, false, true, false]);
      dispose();
    });

    it("notifies a reaction with true then false even when no handler is registered", async () => {
      const submission = new Submission();
      const seen: boolean[] = [];
      const dispose = reaction(
        () => submission.isRunning,
        (isRunning) => seen.push(isRunning)
      );

      await submission.exec();
      expect(seen).toEqual([true, false]);
      dispose();
    });

    it("does not notify a reaction when a handler-less exec is called inside an outer action", async () => {
      const submission = new Submission();
      const seen: boolean[] = [];
      const dispose = reaction(
        () => submission.isRunning,
        (isRunning) => seen.push(isRunning)
      );

      let promise: Promise<boolean> | undefined;
      runInAction(() => {
        promise = submission.exec();
      });
      // PINNED(quirk): a handler-less run completes synchronously (see "completes the whole run synchronously when only
      // didSubmit handlers are registered"), so both isRunning transitions land in the caller's batch and cancel out.
      // Decide: if exec defers completion to a microtask, the reaction sees true here (flip to [true], then
      // [true, false] after the promise resolves).
      expect(seen).toEqual([]);
      await expect(promise).resolves.toBe(true);
      expect(seen).toEqual([]);
      dispose();
    });

    it("batches the transition to false with observable changes made by didSubmit handlers", async () => {
      const submission = new Submission();
      const counter = observable.box(0);
      const timeline: string[] = [];
      const dispose = autorun(() => {
        timeline.push(`isRunning=${submission.isRunning} counter=${counter.get()}`);
      });

      submission.addHandler("submit", async () => true);
      submission.addHandler("didSubmit", () => {
        counter.set(counter.get() + 1);
      });
      submission.addHandler("didSubmit", () => {
        counter.set(counter.get() + 1);
      });

      await submission.exec();
      expect(timeline).toEqual(["isRunning=false counter=0", "isRunning=true counter=0", "isRunning=false counter=2"]);
      dispose();
    });

    it("does not trigger MobX strict-mode warnings while observed", async () => {
      const submission = new Submission();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const dispose = autorun(() => {
        void submission.isRunning;
      });

      submission.addHandler("submit", async () => true);
      await submission.exec();
      expect(warnSpy).not.toHaveBeenCalled();
      dispose();
    });
  });

  describe("#exec lifecycle", () => {
    it("returns true when no handler is registered", async () => {
      const submission = new Submission();
      await expect(submission.exec()).resolves.toBe(true);
    });

    it("returns true when every willSubmit handler succeeds and no submit handler is registered", async () => {
      const submission = new Submission();
      const didSubmit = vi.fn();
      submission.addHandler("willSubmit", async () => true);
      submission.addHandler("didSubmit", didSubmit);

      await expect(submission.exec()).resolves.toBe(true);
      expect(didSubmit).toHaveBeenCalledExactlyOnceWith(true);
    });

    it("does not start the next willSubmit handler until the previous one resolves", async () => {
      const submission = new Submission();
      const first = deferred<boolean>();
      const second = vi.fn(async () => true);

      submission.addHandler("willSubmit", () => first.promise);
      submission.addHandler("willSubmit", second);

      const promise = submission.exec();
      await flushMicrotasks();
      // PINNED(quirk): willSubmit handlers run serially, like submit handlers (the original test "processes willSubmit
      // handlers serially regardless of timing" asserts this too). Decide: the README says "All handlers run in
      // parallel" for willSubmit (and the Handlers JSDoc only marks `submit` as serialized) — run willSubmit handlers
      // concurrently (flip to toHaveBeenCalledTimes(1)) or correct the README?
      expect(second).toHaveBeenCalledTimes(0);

      first.resolve(true);
      await expect(promise).resolves.toBe(true);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("invokes the first submit handler synchronously when no willSubmit handler is registered", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);

      const promise = submission.exec();
      expect(calls).toHaveLength(1);

      calls[0].result.resolve(true);
      await expect(promise).resolves.toBe(true);
    });

    it("invokes the first willSubmit handler synchronously", async () => {
      const submission = new Submission();
      const willSubmit = vi.fn(async () => true);
      submission.addHandler("willSubmit", willSubmit);

      const promise = submission.exec();
      expect(willSubmit).toHaveBeenCalledTimes(1);
      await expect(promise).resolves.toBe(true);
    });

    it("completes the whole run synchronously when only didSubmit handlers are registered", async () => {
      const submission = new Submission();
      const didSubmit = vi.fn();
      submission.addHandler("didSubmit", didSubmit);

      const promise = submission.exec();
      // PINNED(quirk): with nothing to await, didSubmit handlers run and isRunning is reset before exec() even returns
      // its promise, whereas otherwise they run asynchronously. Decide: should exec always defer completion to a
      // microtask so callers observe consistent ordering (flip to { didSubmitCalls: 0, isRunning: true })?
      expect({ didSubmitCalls: didSubmit.mock.calls.length, isRunning: submission.isRunning }).toEqual({
        didSubmitCalls: 1,
        isRunning: false,
      });
      await expect(promise).resolves.toBe(true);
    });

    it("passes the same fresh AbortSignal to the willSubmit and submit handlers of a run", async () => {
      const submission = new Submission();
      const willSubmit = vi.fn(async (_abortSignal: AbortSignal) => true);
      const submit = vi.fn(async (_abortSignal: AbortSignal) => true);
      submission.addHandler("willSubmit", willSubmit);
      submission.addHandler("submit", submit);

      await submission.exec();
      expect(willSubmit.mock.calls[0]).toHaveLength(1);
      expect(submit.mock.calls[0]).toHaveLength(1);

      const signal = willSubmit.mock.calls[0][0];
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(submit.mock.calls[0][0]).toBe(signal);
      expect(signal.aborted).toBe(false);
    });

    it("passes a different AbortSignal to each run", async () => {
      const submission = new Submission();
      const submit = vi.fn(async (_abortSignal: AbortSignal) => true);
      submission.addHandler("submit", submit);

      await submission.exec();
      await submission.exec();
      expect(submit).toHaveBeenCalledTimes(2);
      expect(submit.mock.calls[0][0]).not.toBe(submit.mock.calls[1][0]);
    });

    it("does not abort the signal of a completed run, even when another run starts", async () => {
      const submission = new Submission();
      const submit = vi.fn(async (_abortSignal: AbortSignal) => true);
      submission.addHandler("submit", submit);

      await submission.exec();
      const signal = submit.mock.calls[0][0];
      expect(signal.aborted).toBe(false);

      await submission.exec();
      expect(signal.aborted).toBe(false);
    });

    it("passes exactly one boolean argument to didSubmit handlers", async () => {
      const submission = new Submission();
      const didSubmit = vi.fn();
      submission.addHandler("didSubmit", didSubmit);

      await submission.exec();
      expect(didSubmit.mock.calls).toEqual([[true]]);
    });

    it("passes false to didSubmit handlers when a willSubmit handler returns false", async () => {
      const submission = new Submission();
      const submit = vi.fn(async () => true);
      const didSubmit = vi.fn();
      submission.addHandler("willSubmit", async () => false);
      submission.addHandler("submit", submit);
      submission.addHandler("didSubmit", didSubmit);

      await expect(submission.exec()).resolves.toBe(false);
      expect(submit).not.toHaveBeenCalled();
      expect(didSubmit.mock.calls).toEqual([[false]]);
    });

    it("passes false to didSubmit handlers when a submit handler returns false", async () => {
      const submission = new Submission();
      const didSubmit = vi.fn();
      submission.addHandler("submit", async () => false);
      submission.addHandler("didSubmit", didSubmit);

      await expect(submission.exec()).resolves.toBe(false);
      expect(didSubmit.mock.calls).toEqual([[false]]);
    });

    it("invokes every didSubmit handler in registration order", async () => {
      const submission = new Submission();
      const timeline: string[] = [];
      submission.addHandler("didSubmit", (succeed) => timeline.push(`didSubmit 1: ${succeed}`));
      submission.addHandler("didSubmit", (succeed) => timeline.push(`didSubmit 2: ${succeed}`));
      submission.addHandler("didSubmit", (succeed) => timeline.push(`didSubmit 3: ${succeed}`));

      await submission.exec();
      expect(timeline).toEqual(["didSubmit 1: true", "didSubmit 2: true", "didSubmit 3: true"]);
    });

    it("does not log anything when a handler returns false", async () => {
      const submission = new Submission();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      submission.addHandler("willSubmit", async () => true);
      submission.addHandler("submit", async () => false);

      await expect(submission.exec()).resolves.toBe(false);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("treats falsy resolved values as failure and truthy ones as success at runtime", async () => {
      const results = new Map<unknown, boolean>();
      for (const value of [undefined, null, 0, "", 1, "yes", {}]) {
        const submission = new Submission();
        submission.addHandler("submit", (async () => value) as unknown as Submission.Handlers["submit"]);
        results.set(value, await submission.exec());
      }
      expect([...results.values()]).toEqual([false, false, false, false, true, true, true]);
    });

    it("accepts handlers returning a plain (non-promise) value at runtime", async () => {
      const submission = new Submission();
      const timeline: string[] = [];
      submission.addHandler("willSubmit", (() => {
        timeline.push("willSubmit");
        return true;
      }) as unknown as Submission.Handlers["willSubmit"]);
      submission.addHandler("submit", (() => {
        timeline.push("submit");
        return false;
      }) as unknown as Submission.Handlers["submit"]);

      await expect(submission.exec()).resolves.toBe(false);
      expect(timeline).toEqual(["willSubmit", "submit"]);
    });

    it("does not await async didSubmit handlers", async () => {
      const submission = new Submission();
      const gate = deferred<void>();
      const timeline: string[] = [];
      submission.addHandler("didSubmit", async () => {
        timeline.push("didSubmit start");
        await gate.promise;
        timeline.push("didSubmit end");
      });

      await submission.exec();
      timeline.push("exec resolved");
      gate.resolve();
      await flushMicrotasks();
      // Intended: didSubmit handlers are typed to return void and "run synchronously within a MobX action" (README), so
      // exec does not wait for the asynchronous part of a handler. For rejections, see "does not subscribe to promises
      // returned by didSubmit handlers".
      expect(timeline).toEqual(["didSubmit start", "exec resolved", "didSubmit end"]);
    });

    it("invokes handlers without a this binding", async () => {
      const submission = new Submission();
      const thisValues: unknown[] = [];
      submission.addHandler("willSubmit", async function (this: unknown) {
        thisValues.push(this);
        return true;
      });
      submission.addHandler("submit", async function (this: unknown) {
        thisValues.push(this);
        return true;
      });
      submission.addHandler("didSubmit", function (this: unknown) {
        thisValues.push(this);
      });

      await submission.exec();
      expect(thisValues).toEqual([undefined, undefined, undefined]);
    });
  });

  describe("#exec error handling", () => {
    it("logs a willSubmit error with console.error and skips the remaining willSubmit and all submit handlers", async () => {
      const submission = new Submission();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = new Error("willSubmit failure");
      const nextWillSubmit = vi.fn(async () => true);
      const submit = vi.fn(async () => true);
      const didSubmit = vi.fn();

      submission.addHandler("willSubmit", async () => {
        throw error;
      });
      submission.addHandler("willSubmit", nextWillSubmit);
      submission.addHandler("submit", submit);
      submission.addHandler("didSubmit", didSubmit);

      await expect(submission.exec()).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(error);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(nextWillSubmit).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
      expect(didSubmit.mock.calls).toEqual([[false]]);
      expect(submission.isRunning).toBe(false);
    });

    it("catches synchronous throws from willSubmit handlers", async () => {
      const submission = new Submission();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("sync failure");
      const didSubmit = vi.fn();

      submission.addHandler("willSubmit", () => {
        throw error;
      });
      submission.addHandler("didSubmit", didSubmit);

      await expect(submission.exec()).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(error);
      expect(didSubmit.mock.calls).toEqual([[false]]);
      expect(submission.isRunning).toBe(false);
    });

    it("logs a submit error with console.error and skips the remaining submit handlers", async () => {
      const submission = new Submission();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("submit failure");
      const previousSubmit = vi.fn(async () => true);
      const nextSubmit = vi.fn(async () => true);
      const didSubmit = vi.fn();

      submission.addHandler("submit", previousSubmit);
      submission.addHandler("submit", async () => {
        throw error;
      });
      submission.addHandler("submit", nextSubmit);
      submission.addHandler("didSubmit", didSubmit);

      await expect(submission.exec()).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(error);
      expect(previousSubmit).toHaveBeenCalledTimes(1);
      expect(nextSubmit).not.toHaveBeenCalled();
      expect(didSubmit.mock.calls).toEqual([[false]]);
      expect(submission.isRunning).toBe(false);
    });

    it("logs non-Error rejection values as they are", async () => {
      const submission = new Submission();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const reason = { code: "E_SUBMIT" };

      submission.addHandler("submit", () => Promise.reject(reason));

      await expect(submission.exec()).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(reason);
    });

    it("logs a didSubmit error with console.warn and keeps the result of the run", async () => {
      const submission = new Submission();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = new Error("didSubmit failure");

      submission.addHandler("submit", async () => false);
      submission.addHandler("didSubmit", () => {
        throw error;
      });

      await expect(submission.exec()).resolves.toBe(false);
      expect(warnSpy).toHaveBeenCalledExactlyOnceWith(error);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(submission.isRunning).toBe(false);
    });

    it("skips the remaining didSubmit handlers after one throws", async () => {
      const submission = new Submission();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const previousDidSubmit = vi.fn();
      const nextDidSubmit = vi.fn();

      submission.addHandler("didSubmit", previousDidSubmit);
      submission.addHandler("didSubmit", () => {
        throw new Error("didSubmit failure");
      });
      submission.addHandler("didSubmit", nextDidSubmit);

      await expect(submission.exec()).resolves.toBe(true);
      expect(previousDidSubmit).toHaveBeenCalledExactlyOnceWith(true);
      // PINNED(quirk): a single try/catch wraps the whole didSubmit loop, so one throwing handler silently prevents
      // every later didSubmit handler (e.g. a user's cleanup) from running. Decide: should each didSubmit handler be
      // isolated so the rest still run (flip to toHaveBeenCalledTimes(1))?
      expect(nextDidSubmit).toHaveBeenCalledTimes(0);
    });

    it("does not subscribe to promises returned by didSubmit handlers", async () => {
      const submission = new Submission();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      let subscriptions = 0;
      // `catch`, `finally`, `await` and `Promise.resolve` on a subclass instance all go through `then`
      class TrackedPromise<T> extends Promise<T> {
        // biome-ignore lint/suspicious/noThenProperty: counts every subscription to the promise
        override then<R1 = T, R2 = never>(
          onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
          onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
        ): Promise<R1 | R2> {
          subscriptions++;
          return super.then(onfulfilled, onrejected);
        }
      }
      // Never settles, so the test cannot leak an unhandled rejection
      const returned = new TrackedPromise<void>(() => {});
      submission.addHandler("didSubmit", () => returned);

      await expect(submission.exec()).resolves.toBe(true);
      await flushMicrotasks();
      // PINNED(quirk): exec ignores the value returned by didSubmit handlers, so a rejecting async didSubmit handler
      // escapes the didSubmit try/catch (JSDoc: "Handles exceptions in all phases") as an unhandled rejection instead of
      // being logged with console.warn. Decide: should exec attach a rejection handler to promise-returning didSubmit
      // handlers (flip to toBe(1))?
      expect(subscriptions).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("keeps working normally on the next run after an error", async () => {
      const submission = new Submission();
      vi.spyOn(console, "error").mockImplementation(() => {});
      let shouldThrow = true;

      submission.addHandler("submit", async () => {
        if (shouldThrow) throw new Error("first run fails");
        return true;
      });

      await expect(submission.exec()).resolves.toBe(false);
      shouldThrow = false;
      await expect(submission.exec()).resolves.toBe(true);
      expect(submission.isRunning).toBe(false);
    });

    it("completes the whole run synchronously when the first willSubmit handler throws synchronously", async () => {
      const submission = new Submission();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const didSubmit = vi.fn();
      submission.addHandler("willSubmit", () => {
        throw new Error("sync failure");
      });
      submission.addHandler("didSubmit", didSubmit);

      const promise = submission.exec();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      // PINNED(quirk): a synchronous throw is caught before any `await` is reached, so didSubmit handlers run and
      // isRunning is reset before exec() even returns its promise, whereas a rejecting handler settles asynchronously.
      // Decide: should exec always defer completion to a microtask (flip to { didSubmitCalls: 0, isRunning: true })?
      expect({ didSubmitCalls: didSubmit.mock.calls.length, isRunning: submission.isRunning }).toEqual({
        didSubmitCalls: 1,
        isRunning: false,
      });
      await expect(promise).resolves.toBe(false);
      expect(didSubmit.mock.calls).toEqual([[false]]);
    });
  });

  describe("#addHandler", () => {
    it("returns a disposer that returns undefined and can be called repeatedly", async () => {
      const submission = new Submission();
      const submit = vi.fn(async () => true);

      const dispose = submission.addHandler("submit", submit);
      expect(dispose()).toBeUndefined();
      expect(dispose()).toBeUndefined();

      await submission.exec();
      expect(submit).not.toHaveBeenCalled();
    });

    it("can register a handler again after disposing it", async () => {
      const submission = new Submission();
      const submit = vi.fn(async () => true);

      submission.addHandler("submit", submit)();
      submission.addHandler("submit", submit);

      await submission.exec();
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it("keeps registrations for different events independent", async () => {
      const submission = new Submission();
      const handler = vi.fn(async () => true);

      const disposeWillSubmit = submission.addHandler("willSubmit", handler);
      submission.addHandler("submit", handler);

      await submission.exec();
      expect(handler).toHaveBeenCalledTimes(2);

      disposeWillSubmit();
      await submission.exec();
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("deduplicates the same handler registered twice for the same event", async () => {
      const submission = new Submission();
      const timeline: string[] = [];
      const handler = async () => {
        timeline.push("handler");
        return true;
      };
      const other = async () => {
        timeline.push("other");
        return true;
      };

      const dispose1 = submission.addHandler("submit", handler);
      submission.addHandler("submit", other);
      submission.addHandler("submit", handler);

      await submission.exec();
      // PINNED(quirk): handlers are stored in a Set, so a second registration of the same function is a no-op (it runs
      // once, keeping its original position) and either disposer removes it for both registrations. Decide: should each
      // registration be independent (flip to ["handler", "other", "handler"], and the handler still running after
      // dispose1)?
      expect(timeline).toEqual(["handler", "other"]);

      dispose1();
      timeline.length = 0;
      await submission.exec();
      expect(timeline).toEqual(["other"]);
    });

    it("keeps handlers isolated per instance", async () => {
      const submission1 = new Submission();
      const submission2 = new Submission();
      const submit = vi.fn(async () => true);

      submission1.addHandler("submit", submit);
      await submission2.exec();
      expect(submit).not.toHaveBeenCalled();

      await submission1.exec();
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it("throws a TypeError at runtime for an unknown event name", () => {
      const submission = new Submission();
      expect(() => submission.addHandler("unknown" as keyof Submission.Handlers, async () => true)).toThrow(TypeError);
    });
  });

  describe("handler registration during a running submission", () => {
    it("picks up handlers added mid-run in the same run and keeps them for later runs", async () => {
      const submission = new Submission();
      const timeline: string[] = [];
      let run = 0;

      submission.addHandler("willSubmit", async () => {
        run++;
        timeline.push("willSubmit 1");
        // Register the extra handlers during the first run only
        if (run > 1) return true;
        submission.addHandler("willSubmit", async () => {
          timeline.push("willSubmit added by willSubmit 1");
          return true;
        });
        submission.addHandler("submit", async () => {
          timeline.push("submit added by willSubmit 1");
          return true;
        });
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 1");
        if (run === 1) {
          submission.addHandler("didSubmit", () => {
            timeline.push("didSubmit added by submit 1");
          });
        }
        return true;
      });
      submission.addHandler("didSubmit", () => {
        timeline.push("didSubmit 1");
        if (run === 1) {
          submission.addHandler("didSubmit", () => {
            timeline.push("didSubmit added by didSubmit 1");
          });
        }
      });

      await expect(submission.exec()).resolves.toBe(true);
      expect(timeline.filter((entry) => !entry.includes("added"))).toEqual(["willSubmit 1", "submit 1", "didSubmit 1"]);
      // PINNED(quirk): exec iterates the live handler Sets, so handlers registered while a run is in progress are
      // invoked by that same run. Decide: should a run use a snapshot of the handlers taken when exec starts (flip to [])?
      expect(timeline.filter((entry) => entry.includes("added"))).toEqual([
        "willSubmit added by willSubmit 1",
        "submit added by willSubmit 1",
        "didSubmit added by submit 1",
        "didSubmit added by didSubmit 1",
      ]);

      timeline.length = 0;
      await expect(submission.exec()).resolves.toBe(true);
      expect(timeline).toEqual([
        "willSubmit 1",
        "willSubmit added by willSubmit 1",
        "submit 1",
        "submit added by willSubmit 1",
        "didSubmit 1",
        "didSubmit added by submit 1",
        "didSubmit added by didSubmit 1",
      ]);
    });

    it("skips handlers that are disposed before their turn in the same run", async () => {
      const submission = new Submission();
      const timeline: string[] = [];
      const disposers: (() => void)[] = [];

      submission.addHandler("willSubmit", async () => {
        timeline.push("willSubmit 1");
        for (const dispose of disposers) {
          dispose();
        }
        return true;
      });
      disposers.push(
        submission.addHandler("willSubmit", async () => {
          timeline.push("willSubmit 2");
          return true;
        })
      );
      disposers.push(
        submission.addHandler("submit", async () => {
          timeline.push("submit 1");
          return true;
        })
      );
      submission.addHandler("submit", async () => {
        timeline.push("submit 2");
        return true;
      });
      disposers.push(
        submission.addHandler("didSubmit", () => {
          timeline.push("didSubmit 1");
        })
      );

      await expect(submission.exec()).resolves.toBe(true);
      // Should keep passing if runs start snapshotting their handlers: disposed handlers must still be skipped
      expect(timeline).toEqual(["willSubmit 1", "submit 2"]);
    });

    it("keeps running the rest of the run when the running handler disposes itself", async () => {
      const submission = new Submission();
      const timeline: string[] = [];

      const dispose = submission.addHandler("submit", async () => {
        timeline.push("submit 1");
        dispose();
        return true;
      });
      submission.addHandler("submit", async () => {
        timeline.push("submit 2");
        return true;
      });

      await expect(submission.exec()).resolves.toBe(true);
      await expect(submission.exec()).resolves.toBe(true);
      expect(timeline).toEqual(["submit 1", "submit 2", "submit 2"]);
    });

    it("invokes a handler again in the same run when it disposes and re-registers itself", async () => {
      const submission = new Submission();
      let calls = 0;
      const handler = async () => {
        calls++;
        if (calls === 1) {
          dispose();
          dispose = submission.addHandler("submit", handler);
        }
        return true;
      };
      let dispose = submission.addHandler("submit", handler);

      await expect(submission.exec()).resolves.toBe(true);
      // PINNED(quirk): re-adding a handler to a Set during iteration appends it again, so the same run calls it twice
      // (an unconditional dispose-and-re-register would loop forever). Decide: should a run snapshot its handlers
      // (flip to toBe(1))?
      expect(calls).toBe(2);
    });
  });

  describe("concurrent #exec", () => {
    it("aborts the previous run's signal synchronously before the new run's handlers start", async () => {
      const submission = new Submission();
      const timeline: string[] = [];
      const { calls } = addControlledSubmitHandler(submission);
      submission.addHandler("willSubmit", async (abortSignal) => {
        const run = calls.length + 1;
        abortSignal.addEventListener("abort", () => {
          timeline.push(`abort ${run}: ${(abortSignal.reason as DOMException).name}`);
        });
        timeline.push(`willSubmit ${run}`);
        return true;
      });

      const promise1 = submission.exec();
      await flushMicrotasks();
      expect(calls).toHaveLength(1);

      timeline.push("exec 2");
      const promise2 = submission.exec();
      expect(timeline).toEqual(["willSubmit 1", "exec 2", "abort 1: AbortError", "willSubmit 2"]);
      expect(calls[0].signal.aborted).toBe(true);

      await flushMicrotasks();
      expect(calls).toHaveLength(2);
      expect(calls[1].signal.aborted).toBe(false);

      calls[0].result.resolve(false);
      calls[1].result.resolve(true);
      await expect(promise1).resolves.toBe(false);
      await expect(promise2).resolves.toBe(true);
    });

    it("aborts every superseded run but not the latest one when exec is called repeatedly", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);

      const promises = [submission.exec(), submission.exec(), submission.exec()];
      expect(calls.map((call) => call.signal.aborted)).toEqual([true, true, false]);

      for (const call of calls) {
        call.result.resolve(!call.signal.aborted);
      }
      await expect(Promise.all(promises)).resolves.toEqual([false, false, true]);
      expect(submission.isRunning).toBe(false);
    });

    it("resolves a superseded run with false when its handler honors the abort signal", async () => {
      const submission = new Submission();
      const didSubmit = vi.fn();
      const { calls } = addControlledSubmitHandler(submission);
      submission.addHandler("didSubmit", didSubmit);

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      calls[0].result.resolve(!calls[0].signal.aborted);
      await expect(promise1).resolves.toBe(false);
      // Superseded runs notify didSubmit too; see "invokes didSubmit handlers once per run, including superseded runs"
      expect(didSubmit.mock.calls).toEqual([[false]]);

      calls[1].result.resolve(true);
      await expect(promise2).resolves.toBe(true);
      expect(didSubmit.mock.calls).toEqual([[false], [true]]);
    });

    it("resolves a superseded run with true when its handlers ignore the abort signal", async () => {
      const submission = new Submission();
      const didSubmitArgs: boolean[] = [];
      const { calls } = addControlledSubmitHandler(submission);
      submission.addHandler("didSubmit", (succeed) => didSubmitArgs.push(succeed));

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      calls[0].result.resolve(true);
      const result = await promise1;
      // PINNED(bug): exec never checks its own signal, so a superseded (aborted) run whose handlers resolve true still
      // reports success. Expected: `false` ("@returns `true` if submission succeeded, `false` if failed or aborted"),
      // i.e. { result: false, didSubmitArgs: [false] }. Flip this assertion when fixing.
      expect({ result, didSubmitArgs }).toEqual({ result: true, didSubmitArgs: [true] });

      calls[1].result.resolve(true);
      await expect(promise2).resolves.toBe(true);
    });

    it("keeps invoking the remaining submit handlers of a superseded run", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);
      const abortedSeenByNextSubmit: boolean[] = [];
      submission.addHandler("submit", async (abortSignal) => {
        abortedSeenByNextSubmit.push(abortSignal.aborted);
        return true;
      });

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      calls[0].result.resolve(true);
      await promise1;
      // PINNED(bug): an aborted run keeps going and calls its next submit handler with an already-aborted signal.
      // Expected: a cancelled run stops before invoking further handlers ("Cancels any in-progress submission"), i.e.
      // []. Flip this assertion when fixing.
      expect(abortedSeenByNextSubmit).toEqual([true]);

      calls[1].result.resolve(true);
      await expect(promise2).resolves.toBe(true);
      expect(abortedSeenByNextSubmit.at(-1)).toBe(false);
    });

    it("keeps invoking the remaining willSubmit handlers of a superseded run with that run's own signal", async () => {
      const submission = new Submission();
      const firstWillSubmitCalls: { signal: AbortSignal; result: Deferred<boolean> }[] = [];
      const seenByNextWillSubmit: { ownSignal: boolean; aborted: boolean }[] = [];
      submission.addHandler("willSubmit", (abortSignal) => {
        const result = deferred<boolean>();
        firstWillSubmitCalls.push({ signal: abortSignal, result });
        return result.promise;
      });
      submission.addHandler("willSubmit", async (abortSignal) => {
        seenByNextWillSubmit.push({
          ownSignal: abortSignal === firstWillSubmitCalls[0].signal,
          aborted: abortSignal.aborted,
        });
        return true;
      });

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      firstWillSubmitCalls[0].result.resolve(true);
      await promise1;
      // PINNED(bug): an aborted run keeps going through its remaining willSubmit handlers, which receive the run's own,
      // already-aborted signal. Expected: a cancelled run stops before invoking further handlers ("Cancels any
      // in-progress submission"), i.e. []. Flip this assertion when fixing.
      expect(seenByNextWillSubmit).toEqual([{ ownSignal: true, aborted: true }]);

      firstWillSubmitCalls[1].result.resolve(true);
      await expect(promise2).resolves.toBe(true);
      expect(seenByNextWillSubmit.at(-1)).toEqual({ ownSignal: false, aborted: false });
    });

    it("sets isRunning to false when the latest run settles even though a superseded run is still pending", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);
      const seen: boolean[] = [];
      const dispose = reaction(
        () => submission.isRunning,
        (isRunning) => seen.push(isRunning)
      );

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      calls[1].result.resolve(true);
      await expect(promise2).resolves.toBe(true);
      expect(submission.isRunning).toBe(false);
      expect(seen).toEqual([true, false]);

      calls[0].result.resolve(false);
      await expect(promise1).resolves.toBe(false);
      expect(submission.isRunning).toBe(false);
      expect(seen).toEqual([true, false]);
      dispose();
    });

    it("does not abort a superseded run again, nor the next run, once the latest run has settled", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      calls[1].result.resolve(true);
      await promise2;

      const abortEvents: string[] = [];
      calls[0].signal.addEventListener("abort", () => abortEvents.push("run 1"));
      calls[1].signal.addEventListener("abort", () => abortEvents.push("run 2"));
      const promise3 = submission.exec();
      expect(abortEvents).toEqual([]);
      expect(calls.map((call) => call.signal.aborted)).toEqual([true, false, false]);

      calls[0].result.resolve(false);
      calls[2].result.resolve(true);
      await expect(Promise.all([promise1, promise3])).resolves.toEqual([false, true]);
    });

    it("moves a superseded run from willSubmit on to the submit phase", async () => {
      const submission = new Submission();
      const willSubmitResults: Deferred<boolean>[] = [];
      const abortedSeenBySubmit: boolean[] = [];
      submission.addHandler("willSubmit", () => {
        const result = deferred<boolean>();
        willSubmitResults.push(result);
        return result.promise;
      });
      submission.addHandler("submit", async (abortSignal) => {
        abortedSeenBySubmit.push(abortSignal.aborted);
        return true;
      });

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      willSubmitResults[0].resolve(true);
      await promise1;
      // PINNED(bug): aborting a run during willSubmit does not stop it from entering the submit phase, where submit
      // handlers receive an already-aborted signal. Expected: the cancelled run skips the submit phase, i.e. [].
      // Flip this assertion when fixing.
      expect(abortedSeenBySubmit).toEqual([true]);

      willSubmitResults[1].resolve(true);
      await expect(promise2).resolves.toBe(true);
    });

    it("sets isRunning to false when a superseded run settles while the newer run is still running", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);
      const seen: boolean[] = [];
      const dispose = reaction(
        () => submission.isRunning,
        (isRunning) => seen.push(isRunning)
      );

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      expect(seen).toEqual([true]);

      calls[0].result.resolve(false);
      await promise1;
      expect(calls).toHaveLength(2);
      // PINNED(bug): the superseded run unconditionally resets isRunning when it settles, although the newer run is
      // still in progress. Expected: isRunning stays true until the latest run settles. Flip this assertion when fixing.
      expect(submission.isRunning).toBe(false);

      calls[1].result.resolve(true);
      await promise2;
      expect(submission.isRunning).toBe(false);
      // Holds both now and after the fix: only the timing of the `false` notification changes
      expect(seen).toEqual([true, false]);
      dispose();
    });

    it("cannot abort a running run once a superseded run has settled", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      calls[0].result.resolve(false);
      await promise1;

      const promise3 = submission.exec();
      // PINNED(bug): the superseded run clears the shared abort controller when it settles, dropping the newer run's
      // controller, so a third exec no longer aborts the still-running second run. Expected: the second run's signal
      // is aborted. Flip this assertion when fixing.
      expect(calls[1].signal.aborted).toBe(false);

      calls[1].result.resolve(true);
      calls[2].result.resolve(true);
      await expect(Promise.all([promise2, promise3])).resolves.toEqual([true, true]);
    });

    it("invokes didSubmit handlers once per run, including superseded runs", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);
      const didSubmit = vi.fn();
      submission.addHandler("didSubmit", didSubmit);

      const promise1 = submission.exec();
      const promise2 = submission.exec();
      calls[1].result.resolve(true);
      await promise2;
      calls[0].result.resolve(false);
      await promise1;

      // PINNED(quirk): a superseded run still notifies didSubmit when it settles, even after the newer run has
      // finished (for Form, this can report a failure after a success). Decide: should superseded runs skip didSubmit
      // (flip to [[true]])?
      expect(didSubmit.mock.calls).toEqual([[true], [false]]);
    });
  });

  describe("re-entrant #exec", () => {
    it("starts a new run from a didSubmit handler, keeping isRunning true after the outer run resolves", async () => {
      const submission = new Submission();
      const seen: boolean[] = [];
      const dispose = reaction(
        () => submission.isRunning,
        (isRunning) => seen.push(isRunning)
      );
      const innerResult = deferred<boolean>();
      const didSubmitArgs: boolean[] = [];
      let innerStarted = false;
      let innerPromise: Promise<boolean> | undefined;

      submission.addHandler("submit", async () => (innerStarted ? innerResult.promise : true));
      submission.addHandler("didSubmit", (succeed) => {
        didSubmitArgs.push(succeed);
        if (innerStarted) return;
        // Set the flag before calling exec, since exec invokes handlers synchronously
        innerStarted = true;
        innerPromise = submission.exec();
      });

      await expect(submission.exec()).resolves.toBe(true);
      expect(submission.isRunning).toBe(true);
      expect(seen).toEqual([true]);
      expect(didSubmitArgs).toEqual([true]);

      innerResult.resolve(true);
      await expect(innerPromise).resolves.toBe(true);
      expect(submission.isRunning).toBe(false);
      expect(seen).toEqual([true, false]);
      expect(didSubmitArgs).toEqual([true, true]);
      dispose();
    });

    it("aborts the outer run's signal when exec is called from a willSubmit handler", async () => {
      const submission = new Submission();
      const abortedAfterInnerExec: boolean[] = [];
      let innerStarted = false;
      let innerPromise: Promise<boolean> | undefined;

      submission.addHandler("willSubmit", async (abortSignal) => {
        if (!innerStarted) {
          // Set the flag before calling exec, since exec invokes this handler synchronously
          innerStarted = true;
          innerPromise = submission.exec();
          abortedAfterInnerExec.push(abortSignal.aborted);
        }
        return !abortSignal.aborted;
      });

      const outerPromise = submission.exec();
      expect(abortedAfterInnerExec).toEqual([true]);
      await expect(outerPromise).resolves.toBe(false);
      await expect(innerPromise).resolves.toBe(true);
      expect(submission.isRunning).toBe(false);
    });

    it("hands the abort controller over to a run started from a didSubmit handler", async () => {
      const submission = new Submission();
      const { calls } = addControlledSubmitHandler(submission);
      let innerPromise: Promise<boolean> | undefined;
      submission.addHandler("didSubmit", () => {
        if (innerPromise) return;
        innerPromise = submission.exec();
      });

      const outerPromise = submission.exec();
      calls[0].result.resolve(true);
      await expect(outerPromise).resolves.toBe(true);
      expect(calls).toHaveLength(2);
      // The outer run releases its controller before didSubmit, so the inner exec has nothing to abort
      expect(calls[0].signal.aborted).toBe(false);
      expect(submission.isRunning).toBe(true);

      // The controller of the inner run survives the outer run's cleanup, so a later exec can still abort it
      const promise3 = submission.exec();
      expect(calls[1].signal.aborted).toBe(true);
      expect(calls[2].signal.aborted).toBe(false);

      calls[1].result.resolve(false);
      calls[2].result.resolve(true);
      await expect(Promise.all([innerPromise, promise3])).resolves.toEqual([false, true]);
    });
  });

  describe("misuse", () => {
    it("rejects with a TypeError when exec is called without its instance", async () => {
      const submission = new Submission();
      const { exec } = submission;
      await expect(exec()).rejects.toThrow(TypeError);
      expect(submission.isRunning).toBe(false);
    });

    it("throws a TypeError synchronously when addHandler is called without its instance", () => {
      const submission = new Submission();
      const { addHandler } = submission;
      expect(() => addHandler("submit", async () => true)).toThrow(TypeError);
    });

    it("lets a stale disposer remove a later registration of the same handler", async () => {
      const submission = new Submission();
      const submit = vi.fn(async () => true);

      const staleDispose = submission.addHandler("submit", submit);
      staleDispose();
      submission.addHandler("submit", submit);
      staleDispose();

      await submission.exec();
      // PINNED(quirk): disposers delete the function from a Set rather than their own registration, so calling a stale
      // disposer again (e.g. a duplicated cleanup) silently unregisters a newer registration of the same handler.
      // Decide: should a disposer only remove the registration it was returned for (flip to toHaveBeenCalledTimes(1))?
      expect(submit).toHaveBeenCalledTimes(0);
    });
  });

  describe("types", () => {
    it("exposes only isRunning, addHandler and exec as public members", () => {
      expectTypeOf<keyof Submission>().toEqualTypeOf<"isRunning" | "addHandler" | "exec">();
    });

    it("types the handler map", () => {
      expectTypeOf<keyof Submission.Handlers>().toEqualTypeOf<"willSubmit" | "submit" | "didSubmit">();
      expectTypeOf<Submission.Handlers["willSubmit"]>().toEqualTypeOf<(abortSignal: AbortSignal) => Promise<boolean>>();
      expectTypeOf<Submission.Handlers["submit"]>().toEqualTypeOf<(abortSignal: AbortSignal) => Promise<boolean>>();
      expectTypeOf<Submission.Handlers["didSubmit"]>().toEqualTypeOf<(succeed: boolean) => void>();
    });

    it("types the public members", () => {
      const submission = new Submission();
      expectTypeOf(submission.isRunning).toEqualTypeOf<boolean>();
      expectTypeOf(submission.exec).toEqualTypeOf<() => Promise<boolean>>();
      expectTypeOf(submission.addHandler("willSubmit", async () => true)).toEqualTypeOf<() => void>();
      expectTypeOf(submission.addHandler("submit", async () => true)).toEqualTypeOf<() => void>();
      expectTypeOf(submission.addHandler("didSubmit", () => {})).toEqualTypeOf<() => void>();
    });

    it("infers handler parameter types from the event name", () => {
      const submission = new Submission();
      submission.addHandler("willSubmit", async (abortSignal) => {
        expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal>();
        return true;
      });
      submission.addHandler("submit", async (abortSignal) => {
        expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal>();
        return true;
      });
      submission.addHandler("didSubmit", (succeed) => {
        expectTypeOf(succeed).toEqualTypeOf<boolean>();
      });
    });

    it("accepts async didSubmit handlers at compile time", () => {
      const submission = new Submission();
      // See "does not await async didSubmit handlers" for the runtime consequence.
      submission.addHandler("didSubmit", async () => {});
    });

    it("rejects invalid usage at compile time", () => {
      const submission = new Submission();
      const invalidUsages = () => {
        // @ts-expect-error unknown event
        submission.addHandler("unknown", async () => true);
        // @ts-expect-error willSubmit handlers must resolve to a boolean
        submission.addHandler("willSubmit", async () => {});
        // @ts-expect-error submit handlers must return a Promise
        submission.addHandler("submit", () => true);
        // @ts-expect-error submit handlers must resolve to a boolean
        submission.addHandler("submit", async () => "ok");
        // @ts-expect-error didSubmit handlers receive a boolean, not an AbortSignal
        submission.addHandler("didSubmit", (abortSignal: AbortSignal) => abortSignal.aborted);
        // @ts-expect-error handler is required
        submission.addHandler("submit");
        // @ts-expect-error isRunning is read-only
        submission.isRunning = true;
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });
  });
});
