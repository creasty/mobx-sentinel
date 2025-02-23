import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Validator, makeValidatable } from "./validator";
import { nested } from "./nested";
import { KeyPath, KeyPathSelf } from "./keyPath";

class Sample {
  @observable field1 = 0;
  @observable field2 = 0;

  constructor() {
    makeObservable(this);
  }
}

function setupEnv(opt?: {
  syncTimeline?: boolean;
  syncHandler?: boolean;
  asyncTimeline?: boolean;
  asyncHandler?: boolean;
}) {
  const lag = {
    requestDelay: 90,
    scheduleDelay: 190,
    runTime: 140,
  };

  const model = new Sample();
  const validator = Validator.get(model);

  const timeline: string[] = [];
  if (opt?.asyncTimeline || opt?.asyncHandler || opt?.syncTimeline || opt?.syncHandler) {
    autorun(() => {
      timeline.push(`reactionState: ${validator.reactionState}`);
    });
  }

  let asyncCallCounter = 0;
  if (opt?.asyncTimeline || opt?.asyncHandler) {
    autorun(() => {
      timeline.push(`asyncState: ${validator.asyncState}`);
    });
  }
  if (opt?.asyncHandler) {
    validator.addAsyncHandler(
      () => model.field1,
      async (field1, builder, abortSignal) => {
        const localCounter = ++asyncCallCounter;
        timeline.push(`job start ${localCounter} with payload ${field1}`);
        return new Promise((resolve) => {
          const timerId = setTimeout(() => {
            timeline.push(`job end ${localCounter}`);
            if (field1 < 0) {
              builder.invalidate("field1", "invalid");
            }
            resolve();
          }, lag.runTime);
          abortSignal.onabort = () => {
            clearTimeout(timerId);
            timeline.push(`job aborted ${localCounter}`);
          };
        });
      },
      { initialRun: false }
    );
  }

  let reactionCounter = -1;
  if (opt?.syncHandler) {
    validator.addSyncHandler(
      (builder) => {
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
      },
      { initialRun: false }
    );
  }

  return {
    model,
    validator,
    timeline,
    getAsyncCallCount() {
      return asyncCallCounter;
    },
    async waitForAsyncState(state: number) {
      return vi.waitFor(() => expect(this.validator.asyncState).toBe(state));
    },
    getReactionCount() {
      return Math.max(0, reactionCounter);
    },
    async waitForReactionState(state: number) {
      return vi.waitFor(() => expect(this.validator.reactionState).toBe(state));
    },
  };
}

function buildErrorMap(iter: ReturnType<Validator<any>["findErrors"]>) {
  const result = new Map<KeyPath, Array<string>>();
  for (const [keyPath, error] of iter) {
    let errors = result.get(keyPath);
    if (!errors) {
      errors = [];
      result.set(keyPath, errors);
    }
    errors.push(error.message);
  }
  return result;
}

describe("makeValidatable", () => {
  it("throws an error when a non-object is given", () => {
    expect(() => {
      makeValidatable(null as any, () => void 0);
    }).toThrowError(/Expected an object/);
    expect(() => {
      makeValidatable(1 as any, () => void 0);
    }).toThrowError(/Expected an object/);
  });

  it("adds a sync handler to the validator", () => {
    const target = {};
    const validator = Validator.get(target);
    const spy = vi.spyOn(validator, "addSyncHandler");
    makeValidatable(target, () => void 0);
    expect(spy).toBeCalled();
  });

  it("adds an async handler to the validator", () => {
    const target = {};
    const validator = Validator.get(target);
    const spy = vi.spyOn(validator, "addAsyncHandler");
    makeValidatable(
      target,
      () => true,
      async () => void 0
    );
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
      expect(buildErrorMap(validator.findErrors(KeyPathSelf))).toEqual(new Map());
    });

    it("updates the errors instantly", () => {
      const validator = Validator.get({ sample: false });
      const symbol = Symbol();
      validator.updateErrors(symbol, (builder) => {
        builder.invalidate("sample", "invalid");
      });
      expect(buildErrorMap(validator.findErrors(KeyPathSelf))).toEqual(new Map([["sample", ["invalid"]]]));
    });

    it("removes the errors by calling the returned function", () => {
      const validator = Validator.get({ sample: false });
      const symbol = Symbol();
      const dispose = validator.updateErrors(symbol, (builder) => {
        builder.invalidate("sample", "invalid");
      });
      dispose();
      expect(buildErrorMap(validator.findErrors(KeyPathSelf))).toEqual(new Map());
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
      expect(buildErrorMap(validator.findErrors(KeyPathSelf))).toEqual(new Map([["sample", ["invalid2"]]]));
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
      expect(buildErrorMap(validator.findErrors(KeyPathSelf))).toEqual(new Map([["sample", ["invalid1", "invalid2"]]]));
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
      expect(buildErrorMap(validator.findErrors(KeyPathSelf))).toEqual(new Map([["sample", ["invalid2"]]]));
      dispose2();
      expect(buildErrorMap(validator.findErrors(KeyPathSelf))).toEqual(new Map());
    });
  });

  describe("#findErrors, #getErrorMessages, #hasErrors, #firstErrorMessage", () => {
    class Sample {
      a1 = false;
      b1 = false;
      @nested nested1 = new Nested1();
      @nested array1 = [new Nested1()];
    }

    class Nested1 {
      a2 = false;
      b2 = false;
      @nested nested2 = new Nested2();
      @nested array2 = [new Nested2()];
    }

    class Nested2 {
      a3 = false;
      b3 = false;
    }

    const setupEnv = (opt?: { clean?: boolean }) => {
      const object = new Sample();
      const validator = Validator.get(object);
      const vNested1 = Validator.get(object.nested1);
      const vNested2 = Validator.get(object.nested1.nested2);
      const vArray1 = Validator.get(object.array1[0]);
      const vArray2 = Validator.get(object.array1[0].array2[0]);
      const vNested1Array2 = Validator.get(object.nested1.array2[0]);

      if (!opt?.clean) {
        validator.updateErrors(Symbol(), (builder) => {
          builder.invalidate("a1", "invalid1 at a1");
          builder.invalidate("b1", "invalid1 at b1");
          builder.invalidate("nested1", "invalid1 at nested1");
          builder.invalidate("array1", "invalid1 at array1");
        });
        vNested1.updateErrors(Symbol(), (builder) => {
          builder.invalidate("a2", "invalid2 at nested1.a2");
          builder.invalidate("b2", "invalid2 at nested1.b2");
          builder.invalidate("nested2", "invalid2 at nested1.nested2");
          builder.invalidate("array2", "invalid2 at nested1.array2");
        });
        vNested2.updateErrors(Symbol(), (builder) => {
          builder.invalidate("a3", "invalid3 at nested1.nested2.a3");
          builder.invalidate("b3", "invalid3 at nested1.nested2.b3");
        });
        vArray1.updateErrors(Symbol(), (builder) => {
          builder.invalidate("a2", "invalid4 at array1.0.a2");
          builder.invalidate("b2", "invalid4 at array1.0.b2");
        });
        vArray2.updateErrors(Symbol(), (builder) => {
          builder.invalidate("a3", "invalid5 at array1.0.array2.0.a3");
          builder.invalidate("b3", "invalid5 at array1.0.array2.0.b3");
        });
        vNested1Array2.updateErrors(Symbol(), (builder) => {
          builder.invalidate("a3", "invalid6 at nested1.array2.0.a3");
          builder.invalidate("b3", "invalid6 at nested1.array2.0.b3");
        });
      }

      return { validator };
    };

    describe("#firstErrorMessage", () => {
      it("returns null when there are no errors", () => {
        const env = setupEnv({ clean: true });
        expect(env.validator.firstErrorMessage).toBeNull();
      });

      it("returns the first error message", () => {
        const env = setupEnv();
        expect(env.validator.firstErrorMessage).toBe("invalid1 at a1");
      });
    });

    describe("Search with a self path", () => {
      it("returns an empty iterator when there are no errors", () => {
        const env = setupEnv({ clean: true });
        expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map());
        expect(env.validator.getErrorMessages(KeyPathSelf)).toEqual(new Set());
        expect(env.validator.hasErrors(KeyPathSelf)).toBe(false);
      });

      it("returns own errors", () => {
        const env = setupEnv();
        expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(
          new Map([
            ["a1", ["invalid1 at a1"]],
            ["b1", ["invalid1 at b1"]],
            ["nested1", ["invalid1 at nested1"]],
            ["array1", ["invalid1 at array1"]],
          ])
        );
        expect(env.validator.getErrorMessages(KeyPathSelf)).toEqual(
          new Set(["invalid1 at a1", "invalid1 at b1", "invalid1 at nested1", "invalid1 at array1"])
        );
        expect(env.validator.hasErrors(KeyPathSelf)).toBe(true);
      });

      it("returns all errors with prefix match", () => {
        const env = setupEnv();
        expect(buildErrorMap(env.validator.findErrors(KeyPathSelf, true))).toEqual(
          new Map([
            ["a1", ["invalid1 at a1"]],
            ["b1", ["invalid1 at b1"]],
            ["array1", ["invalid1 at array1"]],
            ["array1.0.a2", ["invalid4 at array1.0.a2"]],
            ["array1.0.b2", ["invalid4 at array1.0.b2"]],
            ["array1.0.array2.0.a3", ["invalid5 at array1.0.array2.0.a3"]],
            ["array1.0.array2.0.b3", ["invalid5 at array1.0.array2.0.b3"]],
            ["nested1", ["invalid1 at nested1"]],
            ["nested1.a2", ["invalid2 at nested1.a2"]],
            ["nested1.b2", ["invalid2 at nested1.b2"]],
            ["nested1.nested2", ["invalid2 at nested1.nested2"]],
            ["nested1.nested2.a3", ["invalid3 at nested1.nested2.a3"]],
            ["nested1.nested2.b3", ["invalid3 at nested1.nested2.b3"]],
            ["nested1.array2", ["invalid2 at nested1.array2"]],
            ["nested1.array2.0.a3", ["invalid6 at nested1.array2.0.a3"]],
            ["nested1.array2.0.b3", ["invalid6 at nested1.array2.0.b3"]],
          ])
        );
        expect(env.validator.getErrorMessages(KeyPathSelf, true)).toEqual(
          new Set([
            "invalid1 at a1",
            "invalid1 at b1",
            "invalid1 at array1",
            "invalid4 at array1.0.a2",
            "invalid4 at array1.0.b2",
            "invalid5 at array1.0.array2.0.a3",
            "invalid5 at array1.0.array2.0.b3",
            "invalid1 at nested1",
            "invalid2 at nested1.a2",
            "invalid2 at nested1.b2",
            "invalid2 at nested1.nested2",
            "invalid3 at nested1.nested2.a3",
            "invalid3 at nested1.nested2.b3",
            "invalid2 at nested1.array2",
            "invalid6 at nested1.array2.0.a3",
            "invalid6 at nested1.array2.0.b3",
          ])
        );
        expect(env.validator.hasErrors(KeyPathSelf, true)).toBe(true);
      });
    });

    describe("Search for a specific path", () => {
      it("returns an empty iterator when there are no errors", () => {
        const env = setupEnv({ clean: true });
        expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map());
        expect(env.validator.getErrorMessages(KeyPathSelf)).toEqual(new Set());
        expect(env.validator.hasErrors(KeyPathSelf)).toBe(false);
      });

      it("returns errors for the specific path", () => {
        const env = setupEnv();
        expect(buildErrorMap(env.validator.findErrors("nested1" as KeyPath))).toEqual(
          new Map([
            ["nested1", ["invalid1 at nested1"]],
            ["nested1.a2", ["invalid2 at nested1.a2"]],
            ["nested1.b2", ["invalid2 at nested1.b2"]],
            ["nested1.nested2", ["invalid2 at nested1.nested2"]],
            ["nested1.array2", ["invalid2 at nested1.array2"]],
          ])
        );
        expect(env.validator.getErrorMessages("nested1" as KeyPath)).toEqual(
          new Set([
            "invalid1 at nested1",
            "invalid2 at nested1.a2",
            "invalid2 at nested1.b2",
            "invalid2 at nested1.nested2",
            "invalid2 at nested1.array2",
          ])
        );
        expect(env.validator.hasErrors("nested1" as KeyPath)).toBe(true);

        expect(buildErrorMap(env.validator.findErrors("nested1.array2" as KeyPath))).toEqual(
          new Map([["nested1.array2", ["invalid2 at nested1.array2"]]])
        );
        expect(env.validator.getErrorMessages("nested1.array2" as KeyPath)).toEqual(
          new Set(["invalid2 at nested1.array2"])
        );
        expect(env.validator.hasErrors("nested1.array2" as KeyPath)).toBe(true);

        expect(buildErrorMap(env.validator.findErrors("nested1.array2.0" as KeyPath))).toEqual(
          new Map([
            ["nested1.array2.0.a3", ["invalid6 at nested1.array2.0.a3"]],
            ["nested1.array2.0.b3", ["invalid6 at nested1.array2.0.b3"]],
          ])
        );
        expect(env.validator.getErrorMessages("nested1.array2.0" as KeyPath)).toEqual(
          new Set(["invalid6 at nested1.array2.0.a3", "invalid6 at nested1.array2.0.b3"])
        );
        expect(env.validator.hasErrors("nested1.array2.0" as KeyPath)).toBe(true);
      });

      it("returns all errors for the specific path with prefix match", () => {
        const env = setupEnv();
        expect(buildErrorMap(env.validator.findErrors("nested1" as KeyPath, true))).toEqual(
          new Map([
            ["nested1", ["invalid1 at nested1"]],
            ["nested1.a2", ["invalid2 at nested1.a2"]],
            ["nested1.b2", ["invalid2 at nested1.b2"]],
            ["nested1.nested2", ["invalid2 at nested1.nested2"]],
            ["nested1.nested2.a3", ["invalid3 at nested1.nested2.a3"]],
            ["nested1.nested2.b3", ["invalid3 at nested1.nested2.b3"]],
            ["nested1.array2", ["invalid2 at nested1.array2"]],
            ["nested1.array2.0.a3", ["invalid6 at nested1.array2.0.a3"]],
            ["nested1.array2.0.b3", ["invalid6 at nested1.array2.0.b3"]],
          ])
        );
        expect(env.validator.getErrorMessages("nested1" as KeyPath, true)).toEqual(
          new Set([
            "invalid1 at nested1",
            "invalid2 at nested1.a2",
            "invalid2 at nested1.b2",
            "invalid2 at nested1.nested2",
            "invalid3 at nested1.nested2.a3",
            "invalid3 at nested1.nested2.b3",
            "invalid2 at nested1.array2",
            "invalid6 at nested1.array2.0.a3",
            "invalid6 at nested1.array2.0.b3",
          ])
        );
        expect(env.validator.hasErrors("nested1.array2" as KeyPath, true)).toBe(true);

        expect(buildErrorMap(env.validator.findErrors("nested1.array2" as KeyPath, true))).toEqual(
          new Map([
            ["nested1.array2", ["invalid2 at nested1.array2"]],
            ["nested1.array2.0.a3", ["invalid6 at nested1.array2.0.a3"]],
            ["nested1.array2.0.b3", ["invalid6 at nested1.array2.0.b3"]],
          ])
        );
        expect(env.validator.getErrorMessages("nested1.array2" as KeyPath, true)).toEqual(
          new Set(["invalid2 at nested1.array2", "invalid6 at nested1.array2.0.a3", "invalid6 at nested1.array2.0.b3"])
        );
        expect(env.validator.hasErrors("nested1.array2" as KeyPath, true)).toBe(true);
      });
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

  describe("Sync validations", () => {
    it("updates errors immediately after a handler is added", async () => {
      const env = setupEnv();
      const spy = vi.fn();
      env.validator.addSyncHandler((b) => {
        spy();
        b.invalidate("field1", "invalid");
      });
      expect(env.validator.reactionState).toBe(0);
      expect(spy).toBeCalledTimes(1);
      expect(env.validator.invalidKeys).toEqual(new Set(["field1"]));
    });

    it("does not update errors when the initialRun option is false", () => {
      const env = setupEnv();
      const spy = vi.fn();
      env.validator.addSyncHandler(
        (b) => {
          spy();
          b.invalidate("field1", "invalid");
        },
        { initialRun: false }
      );
      expect(env.validator.reactionState).toBe(0);
      expect(spy).toBeCalledTimes(1);
      expect(env.validator.invalidKeys).toEqual(new Set());
    });

    it("does nothing when the changes are not related to the handler", () => {
      const env = setupEnv({ syncHandler: true });
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
      const env = setupEnv({ syncHandler: true });
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
      const env = setupEnv({ syncHandler: true });
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
      const env = setupEnv({ syncHandler: true });

      expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);
      expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map([["field1", ["invalid"]]]));
    });

    it("removes the errors when the condition is no longer met", async () => {
      const env = setupEnv({ syncHandler: true });

      expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);

      runInAction(() => {
        env.model.field1 = 0;
      });
      await env.waitForReactionState(0);
      expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map());
    });

    it("removes the handler by calling the returned function", async () => {
      const env = setupEnv();
      const dispose = env.validator.addSyncHandler((b) => {
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

    it("cancels the pending validation when the handler is removed", async () => {
      const env = setupEnv();
      const dispose = env.validator.addSyncHandler((b) => {
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
    it("runs the handler immediately after a handler is added", async () => {
      const env = setupEnv();
      const spy = vi.fn();
      env.validator.addAsyncHandler(() => true, spy);
      expect(env.validator.reactionState).toBe(0);
      expect(env.validator.asyncState).toBe(1);
      await env.waitForAsyncState(0);
      expect(spy).toBeCalledTimes(1);
    });

    it("does not run the handler when the initialRun option is false", () => {
      const env = setupEnv();
      const spy = vi.fn();
      env.validator.addAsyncHandler(() => true, spy, { initialRun: false });
      expect(env.validator.reactionState).toBe(0);
      expect(env.validator.asyncState).toBe(0);
      expect(spy).toBeCalledTimes(0);
    });

    it("removes the handler by calling the returned function", async () => {
      const env = setupEnv();

      const dispose = env.validator.addAsyncHandler(
        () => true,
        async () => {}
      );
      expect(env.validator.reactionState).toBe(0);
      await env.waitForAsyncState(1);

      dispose();
      expect(env.validator.reactionState).toBe(0);
      expect(env.validator.asyncState).toBe(0);
    });

    it("does nothing when the changes are not related to the handler", () => {
      const env = setupEnv({ asyncHandler: true });
      runInAction(() => {
        env.model.field2++;
      });
      expect(env.validator.reactionState).toBe(0);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "reactionState: 0",
          "asyncState: 0",
        ]
      `);
    });

    it("runs the handler when the changes are related to the handler", async () => {
      const env = setupEnv({ asyncHandler: true });
      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      expect(env.validator.isValidating).toBe(true);
      await env.waitForReactionState(0);
      expect(env.validator.asyncState).toBe(1);
      expect(env.validator.isValidating).toBe(true);
      await env.waitForAsyncState(0);
      expect(env.validator.isValidating).toBe(false);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "reactionState: 0",
          "asyncState: 0",
          "reactionState: 1",
          "job start 1 with payload 1",
          "reactionState: 0",
          "asyncState: 1",
          "job end 1",
          "asyncState: 0",
        ]
      `);
    });

    it("keeps delaying the reaction when the changes are made sequentially", async () => {
      const env = setupEnv({ asyncHandler: true });
      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      await env.waitForReactionState(0);
      await env.waitForAsyncState(0);
      expect(env.validator.isValidating).toBe(false);
      expect(env.timeline).toMatchInlineSnapshot(`
        [
          "reactionState: 0",
          "asyncState: 0",
          "reactionState: 1",
          "job start 1 with payload 2",
          "reactionState: 0",
          "asyncState: 1",
          "job end 1",
          "asyncState: 0",
        ]
      `);
      expect(env.getAsyncCallCount()).toBe(1);
    });

    it("updates the errors", async () => {
      const env = setupEnv({ asyncHandler: true });

      expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);
      await env.waitForAsyncState(0);
      expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map([["field1", ["invalid"]]]));
    });

    it("removes the errors when the condition is no longer met", async () => {
      const env = setupEnv({ asyncHandler: true });

      expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);
      await env.waitForAsyncState(0);

      runInAction(() => {
        env.model.field1 = 0;
      });
      await env.waitForReactionState(0);
      await env.waitForAsyncState(0);
      expect(buildErrorMap(env.validator.findErrors(KeyPathSelf))).toEqual(new Map());
    });

    it("removes the handler by calling the returned function", async () => {
      const env = setupEnv();
      const dispose = env.validator.addAsyncHandler(
        () => env.model.field1,
        async (_, b) => {
          b.invalidate("field1", "invalid");
        }
      );

      runInAction(() => {
        env.model.field1++;
      });
      await env.waitForReactionState(0);
      await env.waitForAsyncState(0);

      dispose();

      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(0);
    });

    it("cancels the pending validation when the handler is removed", async () => {
      const env = setupEnv();
      const dispose = env.validator.addAsyncHandler(
        () => env.model.field1,
        async (_, b) => {
          b.invalidate("field1", "invalid");
        }
      );

      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);

      dispose();
      await env.waitForReactionState(0);
      await env.waitForAsyncState(0);
      expect(env.getReactionCount()).toBe(0);
    });
  });

  describe("#reset", () => {
    it("resets the errors and states", async () => {
      const env = setupEnv();

      const symbol = Symbol();
      env.validator.updateErrors(symbol, (builder) => {
        builder.invalidate("field1", "invalid1");
      });
      expect(env.validator.invalidKeyPathCount).toBe(1);

      env.validator.reset();
      expect(env.validator.invalidKeyPathCount).toBe(0);
    });

    it("cancels pending sync validations", async () => {
      const env = setupEnv({ syncHandler: true });

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

      runInAction(() => {
        env.model.field1++;
      });
      await env.waitForAsyncState(1);
      env.validator.reset();
      expect(env.validator.asyncState).toBe(0);
      expect(env.validator.isValidating).toBe(false);
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
