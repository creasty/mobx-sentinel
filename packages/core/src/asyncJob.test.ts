import { autorun } from "mobx";
import { AsyncJob } from "./asyncJob";

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
  });
});
