import { autorun } from "mobx";
import { Validator } from "./validator";

function setupEnv(opt?: { cleanHandlers?: boolean }) {
  const lag = {
    requestDelay: 90,
    scheduleDelay: 190,
    runTime: 140,
  };

  const validator = Validator.get({});

  const timeline: string[] = [];
  autorun(() => {
    timeline.push(`state: ${validator.state}`);
  });

  let counter = 0;
  if (!opt?.cleanHandlers) {
    validator.addHandler(async (abortSignal) => {
      const localCounter = ++counter;
      timeline.push(`job start ${localCounter}`);
      return new Promise((resolve) => {
        const timerId = setTimeout(() => {
          timeline.push(`job end ${localCounter}`);
          resolve({ sample: "error" });
        }, lag.runTime);
        abortSignal.onabort = () => {
          clearTimeout(timerId);
          timeline.push(`job aborted ${localCounter}`);
        };
      });
    });
  }

  return {
    validator,
    timeline,
    getCallCount() {
      return counter;
    },
    request(opt?: { force?: boolean }) {
      return validator.request({
        force: !!opt?.force,
        enqueueDelayMs: lag.requestDelay,
        scheduleDelayMs: lag.scheduleDelay,
      });
    },
    async waitFor(state: Validator.JobState) {
      return vi.waitFor(() => expect(this.validator.state).toBe(state));
    },
  };
}

describe("Validator", () => {
  describe("constructor", () => {
    it("throws an error when attempted to be instantiated directly", () => {
      expect(() => {
        new (Validator as any)();
      }).toThrowError(/private constructor/);
    });
  });

  describe(".get", () => {
    it("throws an error when a non-object is given", () => {
      expect(() => {
        Validator.get(null as any);
      }).toThrowError(/Expected an object/);
      expect(() => {
        Validator.get(1 as any);
      }).toThrowError(/Expected an object/);
    });

    it("returns the same instance for the same target", () => {
      const target = {};
      const validator = Validator.get(target);
      expect(Validator.get(target)).toBe(validator);
    });

    it("returns different instances for different targets", () => {
      const target1 = {};
      const target2 = {};
      expect(Validator.get(target1)).not.toBe(Validator.get(target2));
    });
  });

  describe(".getSafe", () => {
    it("returns null when the target is not an object", () => {
      expect(Validator.getSafe(null as any)).toBeNull();
      expect(Validator.getSafe(1 as any)).toBeNull();
    });
  });

  describe("#request", () => {
    it("process validation handlers in parallel", async () => {
      const env = setupEnv({ cleanHandlers: true });

      env.validator.addHandler(async () => {
        env.timeline.push("validate 1 start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        env.timeline.push("validate 1 end");
        return {};
      });
      env.validator.addHandler(async () => {
        env.timeline.push("validate 2 start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        env.timeline.push("validate 2 end");
        return {};
      });
      env.validator.addHandler(async () => {
        env.timeline.push("validate 3 start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        env.timeline.push("validate 3 end");
        return {};
      });

      env.request();
      await env.waitFor("idle");
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: enqueued",
          "state: running",
          "validate 1 start",
          "validate 2 start",
          "validate 3 start",
          "validate 2 end",
          "validate 3 end",
          "validate 1 end",
          "state: idle",
        ]
      `);
    });

    it("handles errors in submit handlers", async () => {
      const env = setupEnv({ cleanHandlers: true });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      env.validator.addHandler(async () => {
        throw new Error("Test error");
      });

      env.request();
      await env.waitFor("idle");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("enqueues a new validation request", async () => {
      const env = setupEnv();

      expect(env.validator.state).toBe("idle");
      env.request();
      expect(env.validator.state).toBe("enqueued");
      await env.waitFor("idle");

      expect(env.getCallCount()).toBe(1);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: enqueued",
          "state: running",
          "job start 1",
          "job end 1",
          "state: idle",
        ]
      `);
    });

    it("stays enqueued with a subsequent request when the previous request is still running", async () => {
      const env = setupEnv();

      // 1st request
      env.request();
      expect(env.validator.state).toBe("enqueued");

      // 2nd request
      env.request();
      expect(env.validator.state).toBe("enqueued");
      await env.waitFor("idle");

      expect(env.getCallCount()).toBe(1);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: enqueued",
          "state: running",
          "job start 1",
          "job end 1",
          "state: idle",
        ]
      `);
    });

    it("schedules a new validation request after the completion of the current running validation", async () => {
      const env = setupEnv();

      // 1st request
      env.request();
      expect(env.validator.state).toBe("enqueued");
      await env.waitFor("running");

      // 2nd request
      env.request();
      expect(env.validator.state).toBe("running");
      await env.waitFor("scheduled");
      expect(env.getCallCount()).toBe(1);
      await env.waitFor("idle");

      expect(env.getCallCount()).toBe(2);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: enqueued",
          "state: running",
          "job start 1",
          "job end 1",
          "state: scheduled",
          "state: running",
          "job start 2",
          "job end 2",
          "state: idle",
        ]
      `);
    });

    it("stays scheduled with a subsequent request when a previous request is also scheduled", async () => {
      const env = setupEnv();

      // 1st request
      env.request();
      expect(env.validator.state).toBe("enqueued");
      await env.waitFor("running");

      // 2nd request
      env.request();
      expect(env.validator.state).toBe("running");
      await env.waitFor("scheduled");
      expect(env.getCallCount()).toBe(1);

      // 3rd request
      env.request();
      expect(env.validator.state).toBe("scheduled");
      expect(env.getCallCount()).toBe(1);
      await env.waitFor("idle");

      expect(env.getCallCount()).toBe(2);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: enqueued",
          "state: running",
          "job start 1",
          "job end 1",
          "state: scheduled",
          "state: running",
          "job start 2",
          "job end 2",
          "state: idle",
        ]
      `);
    });

    describe("with a force option", () => {
      it("runs immediately", async () => {
        const env = setupEnv();

        env.request({ force: true });
        expect(env.validator.state).toBe("running");
        await env.waitFor("idle");

        expect(env.getCallCount()).toBe(1);
        expect(env.timeline).toMatchInlineSnapshot(`
          [
            "state: idle",
            "state: running",
            "job start 1",
            "job end 1",
            "state: idle",
          ]
        `);
      });

      it("cancels the enqueued request and runs a subsequent request immediately", async () => {
        const env = setupEnv();

        // 1st request
        env.request();
        expect(env.validator.state).toBe("enqueued");

        // 2nd request - before the 1st request is run
        env.request({ force: true });
        expect(env.validator.state).toBe("running");
        await env.waitFor("idle");

        expect(env.getCallCount()).toBe(1);
        expect(env.timeline).toMatchInlineSnapshot(`
          [
            "state: idle",
            "state: enqueued",
            "state: running",
            "job start 1",
            "job end 1",
            "state: idle",
          ]
        `);
      });

      it("cancels the current running validation and runs a subsequent request immediately", async () => {
        const env = setupEnv();

        // 1st request
        env.request();
        expect(env.validator.state).toBe("enqueued");
        await env.waitFor("running");

        // 2nd request - while the 1st request is running
        env.request({ force: true });
        expect(env.validator.state).toBe("running");
        await env.waitFor("idle");

        expect(env.getCallCount()).toBe(2);
        expect(env.timeline).toMatchInlineSnapshot(`
          [
            "state: idle",
            "state: enqueued",
            "state: running",
            "job start 1",
            "job aborted 1",
            "job start 2",
            "job end 2",
            "state: idle",
          ]
        `);
      });
    });
  });

  describe("#reset", () => {
    it("resets the validation", async () => {
      const env = setupEnv();

      env.request();
      await env.waitFor("idle");
      expect(env.validator.errors.size).toBe(1);

      env.validator.reset();
      expect(env.validator.state).toBe("idle");
      expect(env.validator.errors.size).toBe(0);
    });

    it("cancels the scheduled validation", async () => {
      const env = setupEnv();

      env.request();
      env.validator.reset();
      await env.waitFor("idle");

      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "state: idle",
          "state: enqueued",
          "state: idle",
        ]
      `);
    });
  });
});
