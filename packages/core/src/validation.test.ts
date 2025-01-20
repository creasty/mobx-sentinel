import { autorun } from "mobx";
import { toErrorMap, Validation } from "./validation";

function setupEnv(opt?: { cleanHandlers?: boolean }) {
  const lag = {
    requestDelay: 90,
    scheduleDelay: 190,
    runTime: 140,
  };

  const validation = new Validation();

  const timeline: string[] = [];
  autorun(() => {
    timeline.push(`state: ${validation.state}`);
  });

  let counter = 0;
  if (!opt?.cleanHandlers) {
    validation.addHandler(async (abortSignal) => {
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
    validation,
    timeline,
    getCallCount() {
      return counter;
    },
    request(opt?: { force?: boolean }) {
      return validation.request({
        force: !!opt?.force,
        enqueueDelayMs: lag.requestDelay,
        scheduleDelayMs: lag.scheduleDelay,
      });
    },
    async waitFor(state: Validation.JobState) {
      return vi.waitFor(() => expect(this.validation.state).toBe(state));
    },
  };
}

describe("Validation", () => {
  describe("#hasRun", () => {
    it("is set to true when the validation has ever run", async () => {
      const env = setupEnv({ cleanHandlers: true });

      expect(env.validation.hasRun).toBe(false);
      env.request();
      await env.waitFor("idle");
      expect(env.validation.hasRun).toBe(true);

      // Doesn't change for the second time
      env.request();
      await env.waitFor("idle");
      expect(env.validation.hasRun).toBe(true);
    });
  });

  describe("#request", () => {
    it("process validation handlers in parallel", async () => {
      const env = setupEnv({ cleanHandlers: true });

      env.validation.addHandler(async () => {
        env.timeline.push("validate 1 start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        env.timeline.push("validate 1 end");
        return {};
      });
      env.validation.addHandler(async () => {
        env.timeline.push("validate 2 start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        env.timeline.push("validate 2 end");
        return {};
      });
      env.validation.addHandler(async () => {
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

      env.validation.addHandler(async () => {
        throw new Error("Test error");
      });

      env.request();
      await env.waitFor("idle");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("enqueues a new validation request", async () => {
      const env = setupEnv();

      expect(env.validation.state).toBe("idle");
      env.request();
      expect(env.validation.state).toBe("enqueued");
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
      expect(env.validation.state).toBe("enqueued");

      // 2nd request
      env.request();
      expect(env.validation.state).toBe("enqueued");
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
      expect(env.validation.state).toBe("enqueued");
      await env.waitFor("running");

      // 2nd request
      env.request();
      expect(env.validation.state).toBe("running");
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
      expect(env.validation.state).toBe("enqueued");
      await env.waitFor("running");

      // 2nd request
      env.request();
      expect(env.validation.state).toBe("running");
      await env.waitFor("scheduled");
      expect(env.getCallCount()).toBe(1);

      // 3rd request
      env.request();
      expect(env.validation.state).toBe("scheduled");
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
        expect(env.validation.state).toBe("running");
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
        expect(env.validation.state).toBe("enqueued");

        // 2nd request - before the 1st request is run
        env.request({ force: true });
        expect(env.validation.state).toBe("running");
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
        expect(env.validation.state).toBe("enqueued");
        await env.waitFor("running");

        // 2nd request - while the 1st request is running
        env.request({ force: true });
        expect(env.validation.state).toBe("running");
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
      expect(env.validation.hasRun).toBe(true);
      expect(env.validation.errors.size).toBe(1);

      env.validation.reset();
      expect(env.validation.hasRun).toBe(false);
      expect(env.validation.state).toBe("idle");
      expect(env.validation.errors.size).toBe(0);
    });

    it("cancels the scheduled validation", async () => {
      const env = setupEnv();

      env.request();
      env.validation.reset();
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

describe("toErrorMap", () => {
  describe("single result", () => {
    it("ignores null and undefined values", () => {
      expect(toErrorMap([{ field1: null, field2: undefined }])).toEqual(new Map());
    });

    it("ignores empty strings", () => {
      expect(toErrorMap([{ field1: "" }])).toEqual(new Map());
    });

    it("ignores empty arrays", () => {
      expect(toErrorMap([{ field1: [] }])).toEqual(new Map());
    });

    it("works with a string", () => {
      expect(toErrorMap([{ field1: "error" }])).toEqual(new Map([["field1", ["error"]]]));
    });

    it("works with an error", () => {
      expect(toErrorMap([{ field1: new Error("error") }])).toEqual(new Map([["field1", ["error"]]]));
    });

    it("works with an array of strings", () => {
      expect(toErrorMap([{ field1: ["error1", "error2"] }])).toEqual(new Map([["field1", ["error1", "error2"]]]));
    });

    it("works with an array of errors", () => {
      expect(toErrorMap([{ field1: [new Error("error1"), new Error("error2")] }])).toEqual(
        new Map([["field1", ["error1", "error2"]]])
      );
    });

    it("works with an array of strings and errors", () => {
      expect(toErrorMap([{ field1: ["error1", new Error("error2")] }])).toEqual(
        new Map([["field1", ["error1", "error2"]]])
      );
    });
  });

  describe("multiple results", () => {
    it("does not invalidate the result with null or undefined values", () => {
      expect(toErrorMap([{ field1: "error" }, { field1: null }, { field1: undefined }])).toEqual(
        new Map([["field1", ["error"]]])
      );
    });

    it("merges a string and an error", () => {
      expect(toErrorMap([{ field1: "error" }, { field1: new Error("error2") }])).toEqual(
        new Map([["field1", ["error", "error2"]]])
      );
    });

    it("merges non-arrays and arrays", () => {
      expect(toErrorMap([{ field1: "error" }, { field1: ["error2", "error3"] }])).toEqual(
        new Map([["field1", ["error", "error2", "error3"]]])
      );
    });

    it("merges an array of strings and an array of errors", () => {
      expect(
        toErrorMap([{ field1: ["error1", "error2"] }, { field1: [new Error("error3"), new Error("error4")] }])
      ).toEqual(new Map([["field1", ["error1", "error2", "error3", "error4"]]]));
    });

    it("merges multiple fields", () => {
      expect(toErrorMap([{ field1: "error1" }, { field1: "error3", field2: "error4" }])).toEqual(
        new Map([
          ["field1", ["error1", "error3"]],
          ["field2", ["error4"]],
        ])
      );
    });
  });
});
