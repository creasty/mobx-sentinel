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
      expect(timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: running",
          "job start 1 with payload 1",
          "job end 1",
          "state: scheduled",
          "state: running",
          "job start 2 with payload 4",
          "job end 2",
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

      it("does not start another timer when requested twice while scheduled, so the running job is not aborted", async () => {
        const { job, calls } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled"); // t=0: timer A due at t=100

        vi.advanceTimersByTime(20);
        job.request(3); // t=20: only the payload is replaced
        vi.advanceTimersByTime(10);
        job.request(4); // t=30: only the payload is replaced
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(70); // t=100: timer A fires
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(4);
        expect(vi.getTimerCount()).toBe(0);

        vi.advanceTimersByTime(20); // t=120
        expect(calls[1].signal.aborted).toBe(false);
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(2);
      });

      it("runs a later scheduled job at its own deadline after repeated requests while scheduled", async () => {
        const { job, calls } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks(); // t=0: timer A due at t=100
        vi.advanceTimersByTime(20);
        job.request(3); // t=20
        vi.advanceTimersByTime(10);
        job.request(4); // t=30
        vi.advanceTimersByTime(70); // t=100: timer A fires
        expect(calls).toHaveLength(2);

        job.request(5); // queued
        calls[1].resolve();
        await flushMicrotasks(); // t=100: timer B due at t=200
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(20); // t=120
        expect(job.state).toBe("scheduled");
        expect(calls.map((c) => c.payload)).toEqual([1, 4]);
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(80); // t=200: timer B fires
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

      it("keeps the state and abort controller of the forced job when the aborted job settles later", async () => {
        const spy = silenceConsoleError();
        const { job, calls } = setupControlledEnv({ rejectOnAbort: true });

        job.request(1);
        job.request(2, { force: true });
        expect(job.state).toBe("running");

        await flushMicrotasks(); // The first handler rejects with the AbortError
        // PINNED(quirk): the rejection caused by AsyncJob's own abort is reported through console.error like any other failure. Decide: should rejections of an aborted run be swallowed?
        expect(spy.mock.calls).toEqual([[calls[0].signal.reason]]);
        expect(job.state).toBe("running");

        job.request(3);
        expect(calls).toHaveLength(2); // queued until the forced run settles

        job.reset();
        expect(calls[1].signal.aborted).toBe(true);
      });

      it("keeps the scheduled state of the forced job when the aborted job settles later", async () => {
        const { job, calls, states } = setupControlledEnv();

        job.request(1);
        job.request(2, { force: true });
        job.request(3); // queued behind the forced run
        calls[1].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        calls[0].resolve(); // The aborted run ignores its signal and completes
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("running");
        expect(calls).toHaveLength(3);
        expect(calls[2].payload).toBe(3);
        expect(states).toEqual(["idle", "running", "scheduled", "running"]);
      });

      it("keeps the request queued behind the forced job until the forced job settles, even when the aborted job settles first", async () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        job.request(2, { force: true });
        job.request(3); // queued behind the forced run
        expect(job.state).toBe("running");

        calls[0].resolve(); // The aborted run ignores its signal and completes
        await flushMicrotasks();
        expect(job.state).toBe("running");

        vi.advanceTimersByTime(100);
        expect(calls.map((c) => c.payload)).toEqual([1, 2]); // no concurrent run
        expect(calls[1].signal.aborted).toBe(false);

        calls[1].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled");

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("running");
        expect(calls.map((c) => c.payload)).toEqual([1, 2, 3]);
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

      it("cancels the scheduled run and clears the pending payload after repeated requests while scheduled", async () => {
        const { job, calls, states } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks(); // timer A
        job.request(3); // only the payload is replaced
        job.reset();
        expect(vi.getTimerCount()).toBe(0);

        vi.advanceTimersByTime(100);
        expect(calls).toHaveLength(1);
        expect(job.state).toBe("idle");
        expect(states).toEqual(["idle", "running", "scheduled", "idle"]);
        expect(vi.getTimerCount()).toBe(0);
      });

      it("clears a queued request, so the aborted job does not schedule a run when it settles", async () => {
        silenceConsoleError();
        const { job, calls, states } = setupControlledEnv({ rejectOnAbort: true });

        job.request(1);
        job.request(2); // queued
        job.reset();
        expect(job.state).toBe("idle");

        await flushMicrotasks(); // The aborted handler rejects
        expect(job.state).toBe("idle");
        expect(vi.getTimerCount()).toBe(0);

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(1);
        expect(states).toEqual(["idle", "running", "idle"]);
      });

      it("does not carry a queued request over to the next run when the aborted job never settles", async () => {
        const { job, calls } = setupControlledEnv();

        job.request(1);
        job.request(2); // queued
        job.reset();
        job.request(3);
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(3);

        calls[1].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("idle");

        vi.advanceTimersByTime(100);
        expect(job.state).toBe("idle");
        expect(calls).toHaveLength(2);
      });

      it("keeps the state and abort controller of a run started after reset when the aborted job settles later", async () => {
        silenceConsoleError();
        const { job, calls } = setupControlledEnv({ rejectOnAbort: true });

        job.request(1);
        job.reset();
        job.request(2);
        expect(job.state).toBe("running");

        await flushMicrotasks(); // The aborted handler rejects
        expect(job.state).toBe("running");

        job.reset();
        expect(calls[1].signal.aborted).toBe(true);
      });

      it("leaves no timer behind after repeated requests while scheduled, so a run started after reset is not aborted", async () => {
        const { job, calls } = setupControlledEnv({ scheduledRunDelayMs: 100 });

        job.request(1);
        job.request(2);
        calls[0].resolve();
        await flushMicrotasks();
        expect(job.state).toBe("scheduled"); // timer A
        job.request(3); // only the payload is replaced

        job.reset();
        expect(vi.getTimerCount()).toBe(0);

        job.request(4);
        expect(calls).toHaveLength(2);

        vi.advanceTimersByTime(100);
        expect(calls[1].signal.aborted).toBe(false);
        expect(job.state).toBe("running");
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
