import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Validator, makeValidatable } from "./validator";
import { nested } from "./nested";

class Sample {
  @observable field1 = 0;
  @observable field2 = 0;

  constructor() {
    makeObservable(this);
  }
}

function setupEnv(opt?: {
  asyncTimeline?: boolean;
  asyncHandler?: boolean;
  reactiveTimeline?: boolean;
  reactiveHandler?: boolean;
}) {
  const lag = {
    requestDelay: 90,
    scheduleDelay: 190,
    runTime: 140,
  };

  const model = new Sample();
  const validator = Validator.get(model);
  validator.enqueueDelayMs = lag.requestDelay;
  validator.scheduleDelayMs = lag.scheduleDelay;

  const timeline: string[] = [];

  let asyncCallCounter = 0;
  if (opt?.asyncTimeline || opt?.asyncHandler) {
    autorun(() => {
      timeline.push(`jobState: ${validator.jobState}`);
    });
  }
  if (opt?.asyncHandler) {
    validator.addAsyncHandler(async (builder, abortSignal) => {
      const localCounter = ++asyncCallCounter;
      timeline.push(`job start ${localCounter}`);
      return new Promise((resolve) => {
        const timerId = setTimeout(() => {
          timeline.push(`job end ${localCounter}`);
          builder.invalidate("field1", "invalid");
          resolve();
        }, lag.runTime);
        abortSignal.onabort = () => {
          clearTimeout(timerId);
          timeline.push(`job aborted ${localCounter}`);
        };
      });
    });
  }

  let reactionCounter = -1;
  if (opt?.reactiveTimeline || opt?.reactiveHandler) {
    autorun(() => {
      timeline.push(`reactionState: ${validator.reactionState}`);
    });
  }
  if (opt?.reactiveHandler) {
    validator.addReactiveHandler((builder) => {
      reactionCounter++;
      if (reactionCounter > 0) {
        // reaction() guarantees that the handler is called once for its initialization.
        timeline.push(`reaction occurred ${reactionCounter}`);
      } else {
        timeline.push(`reaction registered`);
      }
      if (model.field1 < 0) {
        builder.invalidate("field1", "invalid");
      }
    });
  }

  return {
    model,
    validator,
    timeline,
    getAsyncCallCount() {
      return asyncCallCounter;
    },
    request(opt?: { force?: boolean }) {
      return validator.request({ force: !!opt?.force });
    },
    async waitForJobState(state: Validator.JobState) {
      return vi.waitFor(() => expect(this.validator.jobState).toBe(state));
    },
    getReactionCount() {
      return Math.max(0, reactionCounter);
    },
    async waitForReactionState(state: number) {
      return vi.waitFor(() => expect(this.validator.reactionState).toBe(state));
    },
  };
}

describe("makeValidatable", () => {
  it("throws an error when a non-object is given", () => {
    expect(() => {
      makeValidatable(null as any, () => ({}));
    }).toThrowError(/Expected an object/);
    expect(() => {
      makeValidatable(1 as any, () => ({}));
    }).toThrowError(/Expected an object/);
  });

  it("adds a reactive handler to the validator", () => {
    const target = {};
    const validator = Validator.get(target);
    const spy = vi.spyOn(validator, "addReactiveHandler");
    makeValidatable(target, () => ({}));
    expect(spy).toBeCalled();
  });
});

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

  describe("#updateErrors", () => {
    it("does nothing when the handler returns no errors", () => {
      const validator = Validator.get({ sample: false });
      const symbol = Symbol();
      validator.updateErrors(symbol, () => {});
      expect(validator.errors).toEqual(new Map());
    });

    it("updates the errors instantly", () => {
      const validator = Validator.get({ sample: false });
      const symbol = Symbol();
      validator.updateErrors(symbol, (builder) => {
        builder.invalidate("sample", "invalid");
      });
      expect(validator.errors).toEqual(new Map([["sample", ["invalid"]]]));
    });

    it("removes the errors by calling the returned function", () => {
      const validator = Validator.get({ sample: false });
      const symbol = Symbol();
      const dispose = validator.updateErrors(symbol, (builder) => {
        builder.invalidate("sample", "invalid");
      });
      dispose();
      expect(validator.errors).toEqual(new Map());
    });

    it("replaces the errors when called again with the same key", () => {
      const validator = Validator.get({ sample: false });
      const symbol = Symbol();
      validator.updateErrors(symbol, (builder) => {
        builder.invalidate("sample", "invalid1");
      });
      validator.updateErrors(symbol, (builder) => {
        builder.invalidate("sample", "invalid2");
      });
      expect(validator.errors).toEqual(new Map([["sample", ["invalid2"]]]));
    });

    it("merges the errors of the different keys", () => {
      const validator = Validator.get({ sample: false });
      const symbol1 = Symbol();
      const symbol2 = Symbol();
      validator.updateErrors(symbol1, (builder) => {
        builder.invalidate("sample", "invalid1");
      });
      validator.updateErrors(symbol2, (builder) => {
        builder.invalidate("sample", "invalid2");
      });
      expect(validator.errors).toEqual(new Map([["sample", ["invalid1", "invalid2"]]]));
    });

    it("removes individual errors by calling the returned function", () => {
      const validator = Validator.get({ sample: false });
      const symbol1 = Symbol();
      const symbol2 = Symbol();
      const dispose1 = validator.updateErrors(symbol1, (builder) => {
        builder.invalidate("sample", "invalid1");
      });
      const dispose2 = validator.updateErrors(symbol2, (builder) => {
        builder.invalidate("sample", "invalid2");
      });
      dispose1();
      expect(validator.errors).toEqual(new Map([["sample", ["invalid2"]]]));
      dispose2();
      expect(validator.errors).toEqual(new Map());
    });
  });

  describe("#isValid", () => {
    it("returns true when there are no errors", () => {
      const env = setupEnv();
      expect(env.validator.isValid).toBe(true);
    });

    it("returns false when there are errors", () => {
      const env = setupEnv();
      const symbol = Symbol();
      const dispose = env.validator.updateErrors(symbol, (builder) => {
        builder.invalidate("field1", "invalid");
      });
      expect(env.validator.isValid).toBe(false);

      dispose();
      expect(env.validator.isValid).toBe(true);
    });
  });

  describe("#invalidKeyCount", () => {
    it("returns the number of invalid keys", () => {
      const env = setupEnv();
      const symbol = Symbol();

      const dispose = env.validator.updateErrors(symbol, (builder) => {
        builder.invalidate("field1", "invalid");
      });
      expect(env.validator.invalidKeyCount).toBe(1);

      env.validator.updateErrors(symbol, (builder) => {
        builder.invalidate("field1", "invalid");
        builder.invalidate("field2", "invalid");
      });
      expect(env.validator.invalidKeyCount).toBe(2);

      dispose();
      expect(env.validator.invalidKeyCount).toBe(0);
    });
  });

  describe("#invalidKeys", () => {
    it("returns the set of invalid keys", () => {
      const env = setupEnv();
      const symbol = Symbol();

      const dispose = env.validator.updateErrors(symbol, (builder) => {
        builder.invalidate("field1", "invalid");
      });
      expect(env.validator.invalidKeys).toEqual(new Set(["field1"]));

      env.validator.updateErrors(symbol, (builder) => {
        builder.invalidate("field1", "invalid");
        builder.invalidate("field2", "invalid");
      });
      expect(env.validator.invalidKeys).toEqual(new Set(["field1", "field2"]));

      dispose();
      expect(env.validator.invalidKeys).toEqual(new Set());
    });
  });

  describe("#reset", () => {
    it("resets the errors and states", async () => {
      const env = setupEnv();

      const symbol = Symbol();
      env.validator.updateErrors(symbol, (builder) => {
        builder.invalidate("field1", "invalid1");
      });
      expect(env.validator.errors.size).toBe(1);

      env.validator.reset();
      expect(env.validator.errors.size).toBe(0);
    });

    it("cancels pending reactive validations", async () => {
      const env = setupEnv({ reactiveHandler: true });

      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);

      env.validator.reset();
      await env.waitForReactionState(0);
      expect(env.validator.isValidating).toBe(false);
    });

    it("cancels scheduled async validations", async () => {
      const env = setupEnv({ asyncHandler: true });

      env.request();
      env.validator.reset();
      await env.waitForJobState("idle");
      expect(env.validator.isValidating).toBe(false);

      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "jobState: idle",
          "jobState: enqueued",
          "jobState: idle",
        ]
      `);
    });
  });

  describe("Reactive validations", () => {
    it("does nothing when there are no handlers", () => {
      const env = setupEnv();
      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(0);
    });

    it("does nothing when the changes are not related to the handler", () => {
      const env = setupEnv({ reactiveHandler: true });
      runInAction(() => {
        env.model.field2++;
      });
      expect(env.validator.reactionState).toBe(0);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "reactionState: 0",
          "reaction registered",
        ]
      `);
    });

    it("runs the handler when the changes are related to the handler", async () => {
      const env = setupEnv({ reactiveHandler: true });
      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      expect(env.validator.isValidating).toBe(true);
      await env.waitForReactionState(0);
      expect(env.validator.isValidating).toBe(false);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "reactionState: 0",
          "reaction registered",
          "reactionState: 1",
          "reaction occurred 1",
          "reactionState: 0",
        ]
      `);
    });

    it("keeps delaying the reaction when the changes are made sequentially", async () => {
      const env = setupEnv({ reactiveHandler: true });
      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      await env.waitForReactionState(0);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "reactionState: 0",
          "reaction registered",
          "reactionState: 1",
          "reaction occurred 1",
          "reactionState: 0",
        ]
      `);
      expect(env.getReactionCount()).toBe(1);
    });

    it("updates the errors", async () => {
      const env = setupEnv({ reactiveHandler: true });

      expect(env.validator.errors).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);
      expect(env.validator.errors).toEqual(new Map([["field1", ["invalid"]]]));
    });

    it("removes the errors when the condition is no longer met", async () => {
      const env = setupEnv({ reactiveHandler: true });

      expect(env.validator.errors).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);

      runInAction(() => {
        env.model.field1 = 0;
      });
      await env.waitForReactionState(0);
      expect(env.validator.errors).toEqual(new Map());
    });

    it("removes the handler by calling the returned function", async () => {
      const env = setupEnv();
      const dispose = env.validator.addReactiveHandler((b) => {
        void env.model.field1;
        b.invalidate("field1", "invalid");
      });

      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      await env.waitForReactionState(0);

      dispose();

      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(0);
    });

    it("cancels the pending reactive validation when the handler is removed", async () => {
      const env = setupEnv();
      const dispose = env.validator.addReactiveHandler((b) => {
        void env.model.field1;
        b.invalidate("field1", "invalid");
      });

      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);

      dispose();
      await env.waitForReactionState(0);
      expect(env.getReactionCount()).toBe(0);
    });
  });

  describe("Async validations", () => {
    describe("Watcher integration", () => {
      test("When changes are detected, it calls request() method", async () => {
        const env = setupEnv({ asyncHandler: true });
        const spy = vi.spyOn(env.validator, "request");

        runInAction(() => {
          env.model.field1++;
        });
        expect(spy).toBeCalled();
      });
    });

    describe("#addAsyncHandler", () => {
      it("removes the handler by calling the returned function", async () => {
        const env = setupEnv();

        const dispose = env.validator.addAsyncHandler(async () => {});
        env.request();
        expect(env.validator.jobState).toBe("enqueued");
        await env.waitForJobState("idle");

        dispose();
        env.request();
        expect(env.validator.jobState).toBe("idle");
      });
    });

    describe("#request", () => {
      it("does nothing when there are no handlers", () => {
        const env = setupEnv();
        env.request();
        expect(env.validator.jobState).toBe("idle");
      });

      it("process validation handlers in parallel", async () => {
        const env = setupEnv({ asyncTimeline: true });

        env.validator.addAsyncHandler(async () => {
          env.timeline.push("validate 1 start");
          await new Promise((resolve) => setTimeout(resolve, 50));
          env.timeline.push("validate 1 end");
        });
        env.validator.addAsyncHandler(async () => {
          env.timeline.push("validate 2 start");
          await new Promise((resolve) => setTimeout(resolve, 10));
          env.timeline.push("validate 2 end");
        });
        env.validator.addAsyncHandler(async () => {
          env.timeline.push("validate 3 start");
          await new Promise((resolve) => setTimeout(resolve, 30));
          env.timeline.push("validate 3 end");
        });

        env.request();
        expect(env.validator.isValidating).toBe(true);
        await env.waitForJobState("idle");
        expect(env.validator.isValidating).toBe(false);
        expect(env.timeline).toMatchInlineSnapshot(`
        [
          "jobState: idle",
          "jobState: enqueued",
          "jobState: running",
          "validate 1 start",
          "validate 2 start",
          "validate 3 start",
          "validate 2 end",
          "validate 3 end",
          "validate 1 end",
          "jobState: idle",
        ]
      `);
      });

      it("handles errors in the handler", async () => {
        const env = setupEnv();
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        env.validator.addAsyncHandler(async () => {
          throw new Error("Test error");
        });

        env.request();
        await env.waitForJobState("idle");
        expect(consoleSpy).toHaveBeenCalled();
      });

      it("enqueues a new validation request", async () => {
        const env = setupEnv({ asyncHandler: true });

        expect(env.validator.jobState).toBe("idle");
        env.request();
        expect(env.validator.jobState).toBe("enqueued");
        await env.waitForJobState("idle");

        expect(env.getAsyncCallCount()).toBe(1);
        expect(env.timeline).toMatchInlineSnapshot(`
        [
          "jobState: idle",
          "jobState: enqueued",
          "jobState: running",
          "job start 1",
          "job end 1",
          "jobState: idle",
        ]
      `);
      });

      it("stays enqueued with a subsequent request when the previous request is still running", async () => {
        const env = setupEnv({ asyncHandler: true });

        // 1st request
        env.request();
        expect(env.validator.jobState).toBe("enqueued");

        // 2nd request
        env.request();
        expect(env.validator.jobState).toBe("enqueued");
        await env.waitForJobState("idle");

        expect(env.getAsyncCallCount()).toBe(1);
        expect(env.timeline).toMatchInlineSnapshot(`
        [
          "jobState: idle",
          "jobState: enqueued",
          "jobState: running",
          "job start 1",
          "job end 1",
          "jobState: idle",
        ]
      `);
      });

      it("schedules a new validation request after the completion of the current running validation", async () => {
        const env = setupEnv({ asyncHandler: true });

        // 1st request
        env.request();
        expect(env.validator.jobState).toBe("enqueued");
        await env.waitForJobState("running");

        // 2nd request
        env.request();
        expect(env.validator.jobState).toBe("running");
        await env.waitForJobState("scheduled");
        expect(env.getAsyncCallCount()).toBe(1);
        await env.waitForJobState("idle");

        expect(env.getAsyncCallCount()).toBe(2);
        expect(env.timeline).toMatchInlineSnapshot(`
        [
          "jobState: idle",
          "jobState: enqueued",
          "jobState: running",
          "job start 1",
          "job end 1",
          "jobState: scheduled",
          "jobState: running",
          "job start 2",
          "job end 2",
          "jobState: idle",
        ]
      `);
      });

      it("stays scheduled with a subsequent request when a previous request is also scheduled", async () => {
        const env = setupEnv({ asyncHandler: true });

        // 1st request
        env.request();
        expect(env.validator.jobState).toBe("enqueued");
        await env.waitForJobState("running");

        // 2nd request
        env.request();
        expect(env.validator.jobState).toBe("running");
        await env.waitForJobState("scheduled");
        expect(env.getAsyncCallCount()).toBe(1);

        // 3rd request
        env.request();
        expect(env.validator.jobState).toBe("scheduled");
        expect(env.getAsyncCallCount()).toBe(1);
        await env.waitForJobState("idle");

        expect(env.getAsyncCallCount()).toBe(2);
        expect(env.timeline).toMatchInlineSnapshot(`
        [
          "jobState: idle",
          "jobState: enqueued",
          "jobState: running",
          "job start 1",
          "job end 1",
          "jobState: scheduled",
          "jobState: running",
          "job start 2",
          "job end 2",
          "jobState: idle",
        ]
      `);
      });

      describe("with a force option", () => {
        it("runs immediately", async () => {
          const env = setupEnv({ asyncHandler: true });

          env.request({ force: true });
          expect(env.validator.jobState).toBe("running");
          await env.waitForJobState("idle");

          expect(env.getAsyncCallCount()).toBe(1);
          expect(env.timeline).toMatchInlineSnapshot(`
          [
            "jobState: idle",
            "jobState: running",
            "job start 1",
            "job end 1",
            "jobState: idle",
          ]
        `);
        });

        it("cancels the enqueued request and runs a subsequent request immediately", async () => {
          const env = setupEnv({ asyncHandler: true });

          // 1st request
          env.request();
          expect(env.validator.jobState).toBe("enqueued");

          // 2nd request - before the 1st request is run
          env.request({ force: true });
          expect(env.validator.jobState).toBe("running");
          await env.waitForJobState("idle");

          expect(env.getAsyncCallCount()).toBe(1);
          expect(env.timeline).toMatchInlineSnapshot(`
          [
            "jobState: idle",
            "jobState: enqueued",
            "jobState: running",
            "job start 1",
            "job end 1",
            "jobState: idle",
          ]
        `);
        });

        it("cancels the current running validation and runs a subsequent request immediately", async () => {
          const env = setupEnv({ asyncHandler: true });

          // 1st request
          env.request();
          expect(env.validator.jobState).toBe("enqueued");
          await env.waitForJobState("running");

          // 2nd request - while the 1st request is running
          env.request({ force: true });
          expect(env.validator.jobState).toBe("running");
          await env.waitForJobState("idle");

          expect(env.getAsyncCallCount()).toBe(2);
          expect(env.timeline).toMatchInlineSnapshot(`
          [
            "jobState: idle",
            "jobState: enqueued",
            "jobState: running",
            "job start 1",
            "job aborted 1",
            "job start 2",
            "job end 2",
            "jobState: idle",
          ]
        `);
        });
      });
    });
  });
});

describe("Nested validations", () => {
  class Sample {
    @observable field = true;

    constructor() {
      makeObservable(this);

      makeValidatable(this, (b) => {
        if (!this.field) {
          b.invalidate("field", "invalid");
        }
      });
    }
  }

  class Nested {
    @observable field = true;
    @nested @observable sample = new Sample();
    @nested @observable array = [new Sample()];

    constructor() {
      makeObservable(this);

      makeValidatable(this, (b) => {
        if (!this.field) {
          b.invalidate("field", "invalid");
        }
      });
    }
  }

  const setupEnv = () => {
    const nested = new Nested();
    const nestedValidator = Validator.get(nested);
    const sampleValidator = Validator.get(nested.sample);
    const arrayValidator0 = Validator.get(nested.array[0]);

    return {
      nested,
      nestedValidator,
      sampleValidator,
      arrayValidator0,
      async waitForValidation() {
        await vi.waitFor(() => {
          expect(nestedValidator.isValidating).toBe(false);
          expect(sampleValidator.isValidating).toBe(false);
          expect(arrayValidator0.isValidating).toBe(false);
        });
      },
    };
  };

  test("when a nested validator becomes invalid, the parent validator also becomes invalid", async () => {
    const { nested, nestedValidator, sampleValidator, waitForValidation } = setupEnv();

    expect(sampleValidator.isValid).toBe(true);
    expect(nestedValidator.isValid).toBe(true);

    runInAction(() => {
      nested.sample.field = false;
    });
    await waitForValidation();

    expect(sampleValidator.isValid).toBe(false);
    expect(sampleValidator.invalidKeys).toEqual(new Set(["field"]));
    expect(sampleValidator.invalidKeyCount).toBe(1);

    expect(nestedValidator.isValid).toBe(false);
    expect(nestedValidator.invalidKeys).toEqual(new Set());
    expect(nestedValidator.invalidKeyCount).toBe(0);
    expect(nestedValidator.invalidKeyPaths).toEqual(new Set(["sample.field"]));
    expect(nestedValidator.invalidKeyPathCount).toBe(1);
  });

  test("when a parent validator becomes invalid, nested validators remain unaffected", async () => {
    const { nested, nestedValidator, sampleValidator, waitForValidation } = setupEnv();

    expect(sampleValidator.isValid).toBe(true);
    expect(nestedValidator.isValid).toBe(true);

    runInAction(() => {
      nested.field = false;
    });
    await waitForValidation();

    expect(nestedValidator.isValid).toBe(false);
    expect(nestedValidator.invalidKeys).toEqual(new Set(["field"]));
    expect(nestedValidator.invalidKeyCount).toBe(1);

    expect(sampleValidator.isValid).toBe(true);
  });

  test("count total invalid keys", async () => {
    const { nested, nestedValidator, sampleValidator, arrayValidator0, waitForValidation } = setupEnv();

    runInAction(() => {
      nested.field = false;
      nested.sample.field = false;
      nested.array[0].field = false;
    });
    await waitForValidation();

    expect(nestedValidator.invalidKeyCount).toBe(1);
    expect(sampleValidator.invalidKeyCount).toBe(1);
    expect(arrayValidator0.invalidKeyCount).toBe(1);
    expect(nestedValidator.invalidKeyPathCount).toBe(3);
    expect(nestedValidator.invalidKeyPaths).toEqual(new Set(["field", "sample.field", "array.0.field"]));
  });
});
