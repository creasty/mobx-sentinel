import { autorun } from "mobx";
import { toErrorMap, Validation } from "./validation";

function setupEnv() {
  const lag = {
    requestDelay: 100,
    scheduleDelay: 200,
    runTime: 150,
  };

  const validation = new Validation({
    requestDelayMs: lag.requestDelay,
    scheduleDelayMs: lag.scheduleDelay,
  });

  const timeline: string[] = [];
  autorun(() => {
    timeline.push(`isRunning: ${validation.isRunning}, isScheduled: ${validation.isScheduled}`);
  });

  let counter = 0;
  const executor: Validation.Executor = async () => {
    const localCounter = ++counter;
    timeline.push(`exec: start ${localCounter}`);
    await new Promise((resolve) => setTimeout(resolve, lag.runTime));
    timeline.push(`exec: end ${localCounter}`);
    return { sample: "error" };
  };

  return {
    validation,
    timeline,
    request(opt?: Validation.ExecutorOptions) {
      return validation.request(executor, opt);
    },
    async waitFor(name: keyof typeof lag) {
      const delay = lag[name] + 10; // Offset a little for safety
      await new Promise((resolve) => setTimeout(resolve, delay));
    },
  };
}

describe("Validation", () => {
  describe("#request", () => {
    it(`returns "requested" when a new validation is requested`, async () => {
      const env = setupEnv();

      expect(env.request()).toBe("requested");
      expect(env.validation.isRunning).toBe(false);
      await env.waitFor("requestDelay");
      expect(env.validation.isRunning).toBe(true);
      await env.waitFor("runTime");
      expect(env.validation.isRunning).toBe(false);

      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "isRunning: false, isScheduled: false",
          "isRunning: false, isScheduled: true",
          "exec: start 1",
          "isRunning: true, isScheduled: false",
          "exec: end 1",
          "isRunning: false, isScheduled: false",
        ]
      `);
    });

    it(`returns "requested" for a subsequent request when a previous request is not running`, async () => {
      const env = setupEnv();

      // 1st request
      expect(env.request()).toBe("requested");
      expect(env.validation.isRunning).toBe(false);

      // 2nd request
      expect(env.request()).toBe("requested");
      expect(env.validation.isRunning).toBe(false);
      await env.waitFor("requestDelay");
      expect(env.validation.isRunning).toBe(true);
      await env.waitFor("runTime");
      expect(env.validation.isRunning).toBe(false);

      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "isRunning: false, isScheduled: false",
          "isRunning: false, isScheduled: true",
          "exec: start 1",
          "isRunning: true, isScheduled: false",
          "exec: end 1",
          "isRunning: false, isScheduled: false",
        ]
      `);
    });

    it(`returns "scheduled" when it will be executed after the completion of the current running validation`, async () => {
      const env = setupEnv();

      // 1st request
      expect(env.request()).toBe("requested");
      expect(env.validation.isRunning).toBe(false);
      await env.waitFor("requestDelay");
      expect(env.validation.isRunning).toBe(true);

      // 2nd request
      expect(env.request()).toBe("scheduled");
      await env.waitFor("runTime");
      expect(env.validation.isRunning).toBe(false);
      await env.waitFor("scheduleDelay");
      await env.waitFor("runTime");
      expect(env.validation.isRunning).toBe(false);

      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "isRunning: false, isScheduled: false",
          "isRunning: false, isScheduled: true",
          "exec: start 1",
          "isRunning: true, isScheduled: false",
          "exec: end 1",
          "isRunning: false, isScheduled: false",
          "isRunning: false, isScheduled: true",
          "exec: start 2",
          "isRunning: true, isScheduled: false",
          "exec: end 2",
          "isRunning: false, isScheduled: false",
        ]
      `);
    });

    it(`returns "scheduled" for a subsequent request when a previous request is also scheduled`, async () => {
      const env = setupEnv();

      // 1st request
      expect(env.request()).toBe("requested");
      expect(env.validation.isRunning).toBe(false);
      await env.waitFor("requestDelay");
      expect(env.validation.isRunning).toBe(true);

      // 2nd request
      expect(env.request()).toBe("scheduled");

      // 3rd request
      expect(env.request()).toBe("scheduled");
      await env.waitFor("runTime");
      expect(env.validation.isRunning).toBe(false);
      await env.waitFor("scheduleDelay");
      expect(env.validation.isRunning).toBe(true);
      await env.waitFor("runTime");
      expect(env.validation.isRunning).toBe(false);

      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "isRunning: false, isScheduled: false",
          "isRunning: false, isScheduled: true",
          "exec: start 1",
          "isRunning: true, isScheduled: false",
          "exec: end 1",
          "isRunning: false, isScheduled: false",
          "isRunning: false, isScheduled: true",
          "exec: start 2",
          "isRunning: true, isScheduled: false",
          "exec: end 2",
          "isRunning: false, isScheduled: false",
        ]
      `);
    });

    it(`returns "forced" when it will be executed immediately and cancel the current running validation`, async () => {
      const env = setupEnv();

      // 1st request
      expect(env.request()).toBe("requested");
      expect(env.validation.isRunning).toBe(false);
      await env.waitFor("requestDelay");
      expect(env.validation.isRunning).toBe(true);

      // 2nd request
      expect(env.request({ force: true })).toBe("forced");
      await env.waitFor("runTime");
      expect(env.validation.isRunning).toBe(false);
      await env.waitFor("scheduleDelay");
      await env.waitFor("runTime");
      expect(env.validation.isRunning).toBe(false);

      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "isRunning: false, isScheduled: false",
          "isRunning: false, isScheduled: true",
          "exec: start 1",
          "isRunning: true, isScheduled: false",
          "exec: start 2",
          "exec: end 1",
          "isRunning: false, isScheduled: false",
          "exec: end 2",
        ]
      `);
    });
  });

  describe("#reset", () => {
    it("resets the validation", async () => {
      const env = setupEnv();
      env.request();
      await env.waitFor("requestDelay");
      await env.waitFor("runTime");
      expect(env.validation.errors.size).toBe(1);
      env.validation.reset();
      expect(env.validation.isRunning).toBe(false);
      expect(env.validation.isScheduled).toBe(false);
      expect(env.validation.errors.size).toBe(0);
    });

    it("cancels the scheduled validation", async () => {
      const env = setupEnv();
      env.request();
      env.validation.reset();
      await env.waitFor("requestDelay");
      await env.waitFor("runTime");
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "isRunning: false, isScheduled: false",
          "isRunning: false, isScheduled: true",
          "isRunning: false, isScheduled: false",
        ]
      `);
    });
  });
});

describe("toErrorMap", () => {
  it("converts a validation result to an error map", () => {
    const result = {
      null: null,
      undefined: undefined,
      string: "string",
      error: new Error("error"),
      array: ["string", new Error("error")],
    };
    const map = toErrorMap(result);
    expect(map).toMatchInlineSnapshot(`
      Map {
        "string" => [
          "string",
        ],
        "error" => [
          "error",
        ],
        "array" => [
          "string",
          "error",
        ],
      }
    `);
  });
});
