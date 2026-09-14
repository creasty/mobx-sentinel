import { autorun, configure, isAction, observable } from "mobx";
import { AsyncJob } from "./asyncJob";

type HandlerCall<Payload> = {
  payload: Payload;
  signal: AbortSignal;
  /** State of the job observed from inside the handler */
  stateAtStart: AsyncJob.State;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

/**
 * Set up a job whose handler runs are settled manually by the test.
 *
 * Meant to be used together with fake timers.
 */
function setupControlledEnv<Payload = number>(opt?: { scheduledRunDelayMs?: number; rejectOnAbort?: boolean }) {
  const calls: HandlerCall<Payload>[] = [];
  const job: AsyncJob<Payload> = new AsyncJob<Payload>({
    handler: (payload, signal) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ payload, signal, stateAtStart: job.state, resolve, reject });
        if (opt?.rejectOnAbort) {
          // Mimics abort-aware APIs such as fetch()
          signal.addEventListener("abort", () => reject(signal.reason));
        }
      }),
    scheduledRunDelayMs: opt?.scheduledRunDelayMs ?? 100,
  });

  const states: AsyncJob.State[] = [];
  const dispose = autorun(() => {
    states.push(job.state);
  });
  onTestFinished(dispose);

  return { job, calls, states };
}

/** Flush pending promise continuations (does not advance timers) */
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function useFakeTimers() {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

function silenceConsoleError() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  // spyOn() reuses a spy left installed by another test, together with its call history
  spy.mockClear();
  onTestFinished(() => {
    spy.mockRestore();
  });
  return spy;
}

function setupEnv(opt?: { throwError?: boolean }) {
  const lag = {
    scheduleDelay: 50,
    runTime: 100,
  };

  const timeline: string[] = [];

  let asyncCallCounter = 0;
  const job = new AsyncJob<number>({
    handler: async (payload, abortSignal) => {
      const localCounter = ++asyncCallCounter;
      timeline.push(`job start ${localCounter} with payload ${payload}`);
      if (opt?.throwError) {
        throw new Error("test error");
      }
      return new Promise((resolve) => {
        const timerId = setTimeout(() => {
          timeline.push(`job end ${localCounter}`);
          resolve();
        }, lag.runTime);
        abortSignal.onabort = () => {
          clearTimeout(timerId);
          timeline.push(`job aborted ${localCounter}`);
        };
      });
    },
    scheduledRunDelayMs: lag.scheduleDelay,
  });

  autorun(() => {
    timeline.push(`state: ${job.state}`);
  });

  return {
    job,
    timeline,
    getAsyncCallCount() {
      return asyncCallCounter;
    },
    async waitFor(state: AsyncJob.State) {
      return vi.waitFor(() => expect(job.state).toBe(state));
    },
  };
}

describe("AsyncJob", () => {
  it("is at idle state when initialized", () => {
    const { job } = setupEnv();
    expect(job.state).toBe("idle");
  });

  describe("constructor", () => {
    useFakeTimers();

    it("exposes scheduledRunDelayMs as given", () => {
      const job = new AsyncJob<number>({ handler: async () => {}, scheduledRunDelayMs: 42 });
      expect(job.scheduledRunDelayMs).toBe(42);
    });

    it("neither calls the handler nor schedules a timer", () => {
      const handler = vi.fn(async () => {});
      const job = new AsyncJob<number>({ handler, scheduledRunDelayMs: 100 });
      expect(job.state).toBe("idle");
      expect(handler).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("makes reset a MobX action", () => {
      const job = new AsyncJob<number>({ handler: async () => {}, scheduledRunDelayMs: 100 });
      expect(isAction(job.reset)).toBe(true);
    });
  });

  describe("#state", () => {
    useFakeTimers();

    it("notifies observers only when the state actually changes", async () => {
      const { job, calls, states } = setupControlledEnv();
      expect(states).toEqual(["idle"]);

      job.reset(); // idle -> idle
      expect(states).toEqual(["idle"]);

      job.request(1); // idle -> running
      job.request(2, { force: true }); // running -> running
      expect(states).toEqual(["idle", "running"]);
      calls[1].resolve();
      await flushMicrotasks(); // running -> idle
      expect(states).toEqual(["idle", "running", "idle"]);

      job.request(3); // idle -> running
      job.request(4); // running -> running (queued)
      expect(states).toEqual(["idle", "running", "idle", "running"]);
      calls[2].resolve();
      await flushMicrotasks(); // running -> scheduled
      job.request(5); // scheduled -> scheduled
      expect(states).toEqual(["idle", "running", "idle", "running", "scheduled"]);

      vi.advanceTimersByTime(100); // scheduled -> running
      calls[3].resolve();
      await flushMicrotasks(); // running -> idle
      expect(states).toEqual(["idle", "running", "idle", "running", "scheduled", "running", "idle"]);
      expect(calls.map((c) => c.payload)).toEqual([1, 2, 3, 5]);
    });

    it("changes the state only inside actions on every transition", async () => {
      configure({ enforceActions: "always" });
      onTestFinished(() => {
        configure({ enforceActions: "observed" });
      });
      const warnSpy = vi.spyOn(console, "warn");
      warnSpy.mockClear();
      onTestFinished(() => {
        warnSpy.mockRestore();
      });
      const errorSpy = silenceConsoleError();
      const { job, calls, states } = setupControlledEnv();

      job.request(1); // idle -> running
      job.request(2); // queued
      calls[0].resolve();
      await flushMicrotasks(); // running -> scheduled
      job.request(3); // scheduled -> scheduled
      vi.advanceTimersByTime(100); // scheduled -> running (timer)
      job.request(4, { force: true }); // running -> running
      job.reset(); // running -> idle
      job.request(5); // idle -> running
      calls[3].reject(new Error("boom"));
      await flushMicrotasks(); // running -> idle (after an error)
      expect(vi.getTimerCount()).toBe(0);

      expect(states).toEqual(["idle", "running", "scheduled", "running", "idle", "running", "idle"]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("subscribes the calling derivation to the state when requested from a derivation", async () => {
      // The handler must not read the state itself, or it would subscribe the derivation on its own
      const calls: { payload: number; resolve: () => void }[] = [];
      const job = new AsyncJob<number>({
        handler: (payload) =>
          new Promise<void>((resolve) => {
            calls.push({ payload, resolve });
          }),
        scheduledRunDelayMs: 100,
      });
      const input = observable.box(1);
      let derivationRuns = 0;
      const dispose = autorun(() => {
        derivationRuns++;
        job.request(input.get());
      });
      onTestFinished(dispose);

      expect(derivationRuns).toBe(1);
      expect(calls).toHaveLength(1);

      calls[0].resolve();
      await flushMicrotasks();
      // PINNED(quirk): request() reads the observable state in a tracked way, so the calling autorun re-runs whenever the job changes state: returning to idle re-runs the job with the same payload and entering running queues yet another request, although the input never changed. Decide: should request() read the state untracked (1 derivation run, payloads [1], and the job stays "idle")?
      expect(derivationRuns).toBe(3);
      expect(calls.map((c) => c.payload)).toEqual([1, 1]);
      expect(job.state).toBe("running");

      calls[calls.length - 1].resolve();
      await flushMicrotasks();
      vi.advanceTimersByTime(100);
      // PINNED(quirk): see above; the job keeps re-running on its own, one handler call per cycle. Decide: payloads [1] (no further runs) if the state is read untracked.
      expect(calls.map((c) => c.payload)).toEqual([1, 1, 1]);
    });
  });

  describe("#request", () => {
    it("runs a job as soon as it is requested", async () => {
      const { job, timeline, waitFor } = setupEnv();

      job.request(1);
      expect(job.state).toBe("running");
      await waitFor("idle");
      expect(timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: running",
          "job start 1 with payload 1",
          "job end 1",
          "state: idle",
        ]
      `);
    });

    it("schedules a job to be run after the completion of the current running job", async () => {
      const { job, timeline, waitFor } = setupEnv();

      job.request(1);
      expect(job.state).toBe("running");
      job.request(2);
      await waitFor("idle");
      expect(timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: running",
          "job start 1 with payload 1",
          "job end 1",
          "state: scheduled",
          "state: running",
          "job start 2 with payload 2",
          "job end 2",
          "state: idle",
        ]
      `);
    });

    it("batches multiple requests when the job is running", async () => {
      const { job, timeline, waitFor } = setupEnv();

      job.request(1);
      expect(job.state).toBe("running");
      job.request(2);
      job.request(3);
      await waitFor("idle");
      // payload 2 is discarded
      expect(timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: running",
          "job start 1 with payload 1",
          "job end 1",
          "state: scheduled",
          "state: running",
          "job start 2 with payload 3",
          "job end 2",
          "state: idle",
        ]
      `);
    });

    it("batches multiple requests when the job is scheduled", async () => {
      const { job, timeline, waitFor } = setupEnv();

      job.request(1);
      job.request(2);
      await waitFor("scheduled");
      job.request(3);
      job.request(4);
      await waitFor("idle");
      // payload 2, 3 are discarded
      // PINNED(bug): each request() while scheduled starts another timer without clearing the previous one; a leftover timer fires during job 2 and aborts it ("job aborted 2") although nothing forced or reset it. Expected: "job end 2" instead of "job aborted 2". Flip this snapshot line when fixing.
      expect(timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: running",
          "job start 1 with payload 1",
          "job end 1",
          "state: scheduled",
          "state: running",
          "job start 2 with payload 4",
          "job aborted 2",
          "state: idle",
        ]
      `);
    });

    it("aborts the current running job and runs a new job immediately when the force option is provided", async () => {
      const { job, timeline, waitFor } = setupEnv();

      job.request(1);
      expect(job.state).toBe("running");
      job.request(2, { force: true });
      await waitFor("idle");
      expect(timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: running",
          "job start 1 with payload 1",
          "job aborted 1",
          "job start 2 with payload 2",
          "job end 2",
          "state: idle",
        ]
      `);
    });

    it("handles errors in the handler", async () => {
      const { job, timeline, waitFor } = setupEnv({ throwError: true });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      job.request(1);
      await waitFor("idle");
      expect(timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: running",
          "job start 1 with payload 1",
          "state: idle",
        ]
      `);
      expect(spy).toHaveBeenCalledWith(new Error("test error"));
    });

    describe("with controlled handlers", () => {
      useFakeTimers();

      it("calls the handler synchronously with the payload, a fresh signal, and the running state", () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        expect(calls).toHaveLength(1);
        expect(calls[0].payload).toBe(1);
        expect(calls[0].signal).toBeInstanceOf(AbortSignal);
        expect(calls[0].signal.aborted).toBe(false);
        expect(calls[0].stateAtStart).toBe("running");
        expect(job.state).toBe("running");
      });

      it("passes falsy payloads through to the handler", async () => {
        const { job, calls } = setupControlledEnv<unknown>();

        const payloads = [undefined, null, 0, "", false];
        for (const [i, payload] of payloads.entries()) {
          job.request(payload);
          expect(calls).toHaveLength(i + 1);
          calls[i].resolve();
          await flushMicrotasks();
          expect(job.state).toBe("idle");
        }
        expect(calls.map((c) => c.payload)).toStrictEqual(payloads);
      });

      it("stays running until the handler settles, then returns to idle asynchronously", async () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        vi.advanceTimersByTime(10_000);
        expect(job.state).toBe("running");

        calls[0].resolve();
        expect(job.state).toBe("running");
        await flushMicrotasks();
        expect(job.state).toBe("idle");
        expect(states).toEqual(["idle", "running", "idle"]);
        expect(vi.getTimerCount()).toBe(0);
      });

      it("gives each run its own signal and never aborts the signal of a completed run", async () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        calls[0].resolve();
        await flushMicrotasks();
        job.request(2);
        expect(calls[1].signal).not.toBe(calls[0].signal);

        job.reset();
        expect(calls[1].signal.aborted).toBe(true);
        expect(calls[0].signal.aborted).toBe(false);

        job.request(3, { force: true });
        expect(calls[0].signal.aborted).toBe(false);
      });

      it("runs a queued request with the latest payload exactly scheduledRunDelayMs after the running job settles", async () => {
        const { job, calls, states } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        job.request(3);
        vi.advanceTimersByTime(500); // The delay does not start while running
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(1);

        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(99);
        expect(job.state).toBe("scheduled");
        expect(calls).toHaveLength(1);

        vi.advanceTimersByTime(1);
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(3);
        expect(calls[1].stateAtStart).toBe("running");

        calls[1].resolve();
        await flushMicrotasks();
        vi.advanceTimersByTime(1000);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(2);
        expect(states).toEqual(["idle", "running", "scheduled", "running", "idle"]);
      });

      it("goes through the scheduled state even when scheduledRunDelayMs is 0", async () => {
        const { job, calls } = setupControlledEnv({ scheduledRunDelayMs: 0 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");
        expect(calls).toHaveLength(1);

        vi.advanceTimersByTime(0);
        expect(job.state).toBe("running");
        expect(calls[1].payload).toBe(2);
      });

      it("keeps the original deadline when requested again while scheduled (throttling)", async () => {
        const { job, calls } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(60);
        job.request(3);
        expect(job.state).toBe("scheduled");
        expect(calls).toHaveLength(1);

        vi.advanceTimersByTime(39);
        expect(job.state).toBe("scheduled");
        vi.advanceTimersByTime(1);
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(3);

        calls[1].resolve();
        await flushMicrotasks();
        vi.advanceTimersByTime(1000);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(2);
        expect(vi.getTimerCount()).toBe(0);
      });

      it("leaves an extra timer behind when requested twice while scheduled, which later aborts the running job", async () => {
        const { job, calls } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled"); // t=0: timer A due at t=100

        vi.advanceTimersByTime(20);
        job.request(3); // t=20: timer B due at t=120
        vi.advanceTimersByTime(10);
        job.request(4); // t=30: timer C due at t=130 (tracked; B is no longer tracked)

        vi.advanceTimersByTime(70); // t=100: timer A fires and clears C
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(4);
        // PINNED(bug): request() while scheduled starts another timer without clearing the previous one (JSDoc says "scheduled -> scheduled: No change"), and only the latest timer id is tracked, so timer B survives the run. Expected: no pending timer while the job is running. Flip this assertion when fixing.
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(20); // t=120: timer B fires
        // PINNED(bug): the leftover timer runs an empty job that aborts the running job and forces the state to idle while its handler is still pending. Expected: the job keeps running (signal not aborted, state "running"). Flip these assertions when fixing.
        expect(calls[1].signal.aborted).toBe(true);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(2);
      });

      it("lets an extra timer left by repeated requests while scheduled run a later scheduled job early", async () => {
        const { job, calls } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks(); // t=0: timer A due at t=100
        vi.advanceTimersByTime(20);
        job.request(3); // t=20: timer B due at t=120
        vi.advanceTimersByTime(10);
        job.request(4); // t=30: timer C due at t=130 (tracked; B is no longer tracked)
        vi.advanceTimersByTime(70); // t=100: timer A fires and clears C
        expect(calls).toHaveLength(2);

        job.request(5); // queued
        calls[1].resolve();
        await flushMicrotasks(); // t=100: timer D due at t=200
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(20); // t=120: timer B fires
        // PINNED(bug): the leftover timer runs the scheduled job 80ms before its deadline (and clears timer D), which breaks the throttling. Expected: still "scheduled", payloads [1, 4], and timer D still pending (1) until t=200. Flip these assertions when fixing.
        expect(job.state).toBe("running");
        expect(calls.map((c) => c.payload)).toEqual([1, 4, 5]);
        expect(vi.getTimerCount()).toBe(0);
      });

      it("does not deduplicate identical payloads", async () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        job.request(1);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(100);
        expect(calls.map((c) => c.payload)).toEqual([1, 1]);
      });

      it("queues a request made synchronously from inside the handler", async () => {
        const payloads: number[] = [];
        const job: AsyncJob<number> = new AsyncJob<number>({
          handler: async (payload) => {
            payloads.push(payload);
            if (payload === 1) {
              job.request(2);
            }
          },
          scheduledRunDelayMs: 100,
        });

        job.request(1);
        expect(job.state).toBe("running");
        expect(payloads).toEqual([1]);

        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(100);
        expect(payloads).toEqual([1, 2]);
        await flushMicrotasks();
        expect(job.state).toBe("idle");
      });

      it("still runs a queued request after the running job rejects", async () => {
        const spy = silenceConsoleError();
        const { job, calls } = setupControlledEnv();

        job.request(1);
        job.request(2);
        const error = new Error("boom");
        calls[0].reject(error);
        await flushMicrotasks();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toBe(error);
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("running");
        expect(calls[1].payload).toBe(2);
      });

      it("logs the rejection reason as-is even when it is not an Error", async () => {
        const spy = silenceConsoleError();
        const { job, calls } = setupControlledEnv();

        job.request(1);
        calls[0].reject("plain string");
        await flushMicrotasks();
        expect(spy.mock.calls).toEqual([["plain string"]]);
        expect(job.state).toBe("idle");
      });

      it("logs a synchronous throw from the handler and returns to idle before request() returns", () => {
        const spy = silenceConsoleError();
        const error = new Error("sync");
        const job = new AsyncJob<number>({
          handler: () => {
            throw error;
          },
          scheduledRunDelayMs: 100,
        });
        const states: AsyncJob.State[] = [];
        onTestFinished(autorun(() => states.push(job.state)));

        job.request(1);
        expect(job.state).toBe("idle");
        expect(states).toEqual(["idle", "running", "idle"]);
        expect(spy.mock.calls).toEqual([[error]]);
      });
    });

    describe("with the force option", () => {
      useFakeTimers();

      it("runs immediately from idle", () => {
        const { job, calls } = setupControlledEnv();

        job.request(1, { force: true });
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(1);
        expect(calls[0].payload).toBe(1);
      });

      it("treats force: false and an empty option object as a normal request", async () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        job.request(2, { force: false });
        job.request(3, {});
        expect(calls).toHaveLength(1);
        expect(calls[0].signal.aborted).toBe(false);
        expect(job.state).toBe("running");

        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        job.request(4, { force: false });
        expect(job.state).toBe("scheduled");
        expect(calls).toHaveLength(1);

        vi.advanceTimersByTime(100);
        expect(calls.map((c) => c.payload)).toEqual([1, 4]);
      });

      it("aborts the running job before calling the new handler, so abort listeners still see the running state", () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        let stateOnAbort: AsyncJob.State | undefined;
        let callsOnAbort: number | undefined;
        calls[0].signal.addEventListener("abort", () => {
          stateOnAbort = job.state;
          callsOnAbort = calls.length;
        });

        job.request(2, { force: true });
        expect(stateOnAbort).toBe("running");
        expect(callsOnAbort).toBe(1); // The new handler has not been called yet
        expect(calls).toHaveLength(2);
      });

      it("runs immediately from scheduled and cancels the scheduled run", async () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        job.request(3, { force: true });
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(3);
        expect(vi.getTimerCount()).toBe(0);

        calls[1].resolve();
        await flushMicrotasks();
        vi.advanceTimersByTime(1000);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(2);
        expect(states).toEqual(["idle", "running", "scheduled", "running", "idle"]);
      });

      it("aborts the running job with an AbortError and starts the new one synchronously", async () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        const firstSignal = calls[0].signal;
        job.request(2, { force: true });

        expect(firstSignal.aborted).toBe(true);
        expect(firstSignal.reason).toBeInstanceOf(DOMException);
        expect(firstSignal.reason.name).toBe("AbortError");

        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(2);
        expect(calls[1].signal).not.toBe(firstSignal);
        expect(calls[1].signal.aborted).toBe(false);
        expect(calls[1].stateAtStart).toBe("running");

        // The first handler never settles here, so only the forced run drives the state
        calls[1].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("idle");
        expect(states).toEqual(["idle", "running", "idle"]);
      });

      it("goes through a scheduled state that runs nothing when forced while a request is queued", async () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        job.request(2); // queued
        job.request(3, { force: true });
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(3);

        calls[1].resolve();
        await flushMicrotasks();
        // PINNED(quirk): force consumes the latest payload but leaves the queued-request flag set, so the job goes "scheduled" and later back to "idle" without calling the handler. Decide: should force also clear the queued request so the job returns straight to "idle"?
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(2);
        // PINNED(quirk): see above; the observable history contains the empty "scheduled" phase. Decide: drop "scheduled" from this history if force clears the queued request.
        expect(states).toEqual(["idle", "running", "scheduled", "idle"]);
      });

      it("lets the aborted job overwrite the state and abort controller of the forced job when it settles later", async () => {
        const spy = silenceConsoleError();
        const { job, calls } = setupControlledEnv({ rejectOnAbort: true });

        job.request(1);
        job.request(2, { force: true });
        expect(job.state).toBe("running");

        await flushMicrotasks(); // The first handler rejects with the AbortError
        // PINNED(quirk): the rejection caused by AsyncJob's own abort is reported through console.error like any other failure. Decide: should rejections of an aborted run be swallowed?
        expect(spy.mock.calls).toEqual([[calls[0].signal.reason]]);
        // PINNED(bug): the continuation of the aborted run sets the state to "idle" although the forced run is still pending. Expected: "running". Flip this assertion when fixing.
        expect(job.state).toBe("idle");

        job.request(3);
        // PINNED(bug): because the state is "idle", a normal request starts a concurrent run instead of being queued. Expected: 2 (queued until the forced run settles). Flip this assertion when fixing.
        expect(calls).toHaveLength(3);

        job.reset();
        // PINNED(bug): the continuation of the aborted run also dropped the forced run's AbortController, so nothing can abort the forced run anymore. Expected: true. Flip this assertion when fixing.
        expect(calls[1].signal.aborted).toBe(false);
      });

      it("lets the aborted job overwrite the scheduled state of the forced job when it settles later", async () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        job.request(2, { force: true });
        job.request(3); // queued behind the forced run
        calls[1].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        calls[0].resolve(); // The aborted run ignores its signal and completes
        await flushMicrotasks();
        // PINNED(bug): the continuation of the aborted run sets the state to "idle" although a run is still scheduled (its timer is pending). Expected: "scheduled". Flip this assertion when fixing.
        expect(job.state).toBe("idle");
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(3);
        expect(calls[2].payload).toBe(3);
        // PINNED(bug): see above; the history shows "idle" between "scheduled" and "running". Expected: ["idle", "running", "scheduled", "running"]. Flip this assertion when fixing.
        expect(states).toEqual(["idle", "running", "scheduled", "idle", "running"]);
      });

      it("lets the aborted job take over the request queued behind the forced job, which then runs concurrently with the forced job", async () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        job.request(2, { force: true });
        job.request(3); // queued behind the forced run
        expect(job.state).toBe("running");

        calls[0].resolve(); // The aborted run ignores its signal and completes
        await flushMicrotasks();
        // PINNED(bug): the continuation of the aborted run consumes the queued request and enters "scheduled" although the forced run is still pending. Expected: "running". Flip this assertion when fixing.
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(100);
        // PINNED(bug): the scheduled run starts while the forced run is still pending, so two handlers run concurrently (class JSDoc: "Queues subsequent requests while running"). Expected: payloads [1, 2] (run 3 waits until the forced run settles). Flip this assertion when fixing.
        expect(calls.map((c) => c.payload)).toEqual([1, 2, 3]);
        // The continuation of the aborted run dropped the forced run's AbortController, so starting run 3 does not abort it
        expect(calls[1].signal.aborted).toBe(false);

        calls[1].resolve();
        await flushMicrotasks();
        // PINNED(bug): the continuation of the forced run sets the state to "idle" although run 3 is pending here. Expected: once fixed, run 3 has not started at this point and the queued request is now "scheduled". Flip this assertion when fixing.
        expect(job.state).toBe("idle");
      });
    });
  });

  describe("#reset", () => {
    it("cancels the current running job", async () => {
      const { job, timeline } = setupEnv();

      job.request(1);
      expect(job.state).toBe("running");
      job.reset();
      expect(job.state).toBe("idle");
      expect(timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: running",
          "job start 1 with payload 1",
          "job aborted 1",
          "state: idle",
        ]
      `);
    });

    describe("with controlled handlers", () => {
      useFakeTimers();

      it("does nothing when idle", () => {
        const { job, calls, states } = setupControlledEnv();

        job.reset();
        expect(job.state).toBe("idle");
        expect(states).toEqual(["idle"]);
        expect(calls).toHaveLength(0);
        expect(vi.getTimerCount()).toBe(0);

        job.request(1);
        expect(job.state).toBe("running");
      });

      it("cancels a scheduled run without calling the handler", async () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        job.reset();
        expect(job.state).toBe("idle");
        expect(vi.getTimerCount()).toBe(0);

        vi.advanceTimersByTime(1000);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(1);
        expect(states).toEqual(["idle", "running", "scheduled", "idle"]);
      });

      it("runs the next request immediately after cancelling a scheduled run", async () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        job.reset();

        job.request(3);
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(3);
      });

      it("aborts the running job with an AbortError and returns to idle synchronously", () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        job.reset();
        expect(calls[0].signal.aborted).toBe(true);
        expect(calls[0].signal.reason).toBeInstanceOf(DOMException);
        expect(calls[0].signal.reason.name).toBe("AbortError");
        expect(job.state).toBe("idle");
        expect(states).toEqual(["idle", "running", "idle"]);

        job.request(2);
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(2);
        expect(calls[1].signal.aborted).toBe(false);
      });

      it("aborts the running job before the state changes, so abort listeners still see the running state", () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        let stateOnAbort: AsyncJob.State | undefined;
        calls[0].signal.addEventListener("abort", () => {
          stateOnAbort = job.state;
        });

        job.reset();
        expect(stateOnAbort).toBe("running");
        expect(states).toEqual(["idle", "running", "idle"]);
      });

      it("stays idle without logging or notifying when an aborted job settles later", async () => {
        const spy = silenceConsoleError();
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        job.reset();
        calls[0].resolve();
        await flushMicrotasks();
        vi.advanceTimersByTime(1000);

        expect(job.state).toBe("idle");
        expect(states).toEqual(["idle", "running", "idle"]);
        expect(spy).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);

        job.reset();
        job.reset(); // Repeated resets are harmless
        expect(states).toEqual(["idle", "running", "idle"]);
      });

      it("clears the pending payload, so a timer left behind by repeated requests runs nothing", async () => {
        const { job, calls, states } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks(); // timer A (untracked after the next request)
        job.request(3); // timer B (tracked)
        job.reset();
        // PINNED(bug): reset() does not cancel timer A, which was left untracked by the repeated request (JSDoc: "Cancels any scheduled execution"). Expected: 0. Flip this assertion when fixing.
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(100); // timer A fires
        expect(calls).toHaveLength(1);
        expect(job.state).toBe("idle");
        expect(states).toEqual(["idle", "running", "scheduled", "idle"]);
        expect(vi.getTimerCount()).toBe(0);
      });

      it("does not clear a queued request, so the aborted job schedules an empty run when it settles", async () => {
        silenceConsoleError();
        const { job, calls, states } = setupControlledEnv({ rejectOnAbort: true });

        job.request(1);
        job.request(2); // queued
        job.reset();
        expect(job.state).toBe("idle");

        await flushMicrotasks(); // The aborted handler rejects
        // PINNED(bug): reset() leaves the queued-request flag set, so the continuation of the aborted run moves the state back to "scheduled" (JSDoc: "Clears queued payload", "Returns to idle state"). Expected: "idle". Flip this assertion when fixing.
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(1);
        // PINNED(bug): see above. Expected: ["idle", "running", "idle"]. Flip this assertion when fixing.
        expect(states).toEqual(["idle", "running", "idle", "scheduled", "idle"]);
      });

      it("carries a queued request over to the next run when the aborted job never settles", async () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        job.request(2); // queued
        job.reset();
        job.request(3);
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(3);

        calls[1].resolve();
        await flushMicrotasks();
        // PINNED(bug): the queued-request flag survived reset(), so completing the unrelated run 3 enters "scheduled" (JSDoc of reset: "Clears queued payload"). Expected: "idle". Flip this assertion when fixing.
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(2);
      });

      it("lets the aborted job overwrite the state and abort controller of a run started after reset", async () => {
        silenceConsoleError();
        const { job, calls } = setupControlledEnv({ rejectOnAbort: true });

        job.request(1);
        job.reset();
        job.request(2);
        expect(job.state).toBe("running");

        await flushMicrotasks(); // The aborted handler rejects
        // PINNED(bug): the continuation of the aborted run sets the state to "idle" although run 2 is still pending. Expected: "running". Flip this assertion when fixing.
        expect(job.state).toBe("idle");

        job.reset();
        // PINNED(bug): the continuation of the aborted run also dropped run 2's AbortController, so reset() cannot abort it. Expected: true. Flip this assertion when fixing.
        expect(calls[1].signal.aborted).toBe(false);
      });

      it("does not cancel an untracked timer left by repeated requests while scheduled", async () => {
        const { job, calls } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled"); // timer A (untracked after the next request)
        job.request(3); // timer B (tracked)

        job.reset();
        // PINNED(bug): reset() only clears the latest timer, so timer A survives (JSDoc: "Cancels any scheduled execution"). Expected: 0. Flip this assertion when fixing.
        expect(vi.getTimerCount()).toBe(1);

        job.request(4);
        expect(calls).toHaveLength(2);

        vi.advanceTimersByTime(100); // timer A fires
        // PINNED(bug): the leftover timer aborts run 4 and forces the state to "idle" while its handler is pending. Expected: not aborted and still "running". Flip these assertions when fixing.
        expect(calls[1].signal.aborted).toBe(true);
        expect(job.state).toBe("idle");
      });
    });
  });

  describe("types", () => {
    it("defines State as a union of the three states", () => {
      expectTypeOf<AsyncJob.State>().toEqualTypeOf<"idle" | "running" | "scheduled">();
    });

    it("defines Handler as a function of the payload and an AbortSignal returning a Promise", () => {
      expectTypeOf<AsyncJob.Handler<number>>().toEqualTypeOf<
        (payload: number, abortSignal: AbortSignal) => Promise<void>
      >();
    });

    it("infers the payload type from the handler", () => {
      const job = new AsyncJob({ handler: async (_payload: string) => {}, scheduledRunDelayMs: 0 });
      expectTypeOf(job).toEqualTypeOf<AsyncJob<string>>();
      expectTypeOf(job.state).toEqualTypeOf<AsyncJob.State>();
      expectTypeOf(job.scheduledRunDelayMs).toEqualTypeOf<number>();
      expectTypeOf(job.request).parameters.toEqualTypeOf<[string, { force?: boolean }?]>();
      expectTypeOf(job.request).returns.toEqualTypeOf<void>();
      expectTypeOf(job.reset).toEqualTypeOf<() => void>();
    });

    it("allows omitting the payload only when it is void", () => {
      const job = new AsyncJob<void>({ handler: async () => {}, scheduledRunDelayMs: 0 });
      expectTypeOf(job.request).toBeCallableWith();
      expectTypeOf(job.request).toBeCallableWith(undefined, { force: true });
    });

    it("rejects invalid usage at compile time", () => {
      const job = new AsyncJob<number>({ handler: async () => {}, scheduledRunDelayMs: 0 });
      const invalidUsages = () => {
        // @ts-expect-error payload type mismatch
        job.request("1");
        // @ts-expect-error payload is required
        job.request();
        // @ts-expect-error unknown option
        job.request(1, { delay: 1 });
        // @ts-expect-error state is read-only
        job.state = "idle";
        // @ts-expect-error scheduledRunDelayMs is read-only
        job.scheduledRunDelayMs = 1;
        // @ts-expect-error the handler must return a Promise
        new AsyncJob<number>({ handler: () => {}, scheduledRunDelayMs: 0 });
        // @ts-expect-error scheduledRunDelayMs is required
        new AsyncJob<number>({ handler: async () => {} });
      };
      expectTypeOf(invalidUsages).toBeFunction();
    });
  });
});
