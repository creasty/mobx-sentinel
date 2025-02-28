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
      const validator1 = Validator.get(target);
      const validator2 = Validator.get(target);
      expect(validator1).toBe(validator2);
      expect(validator1.id).toBe(validator2.id);
    });

    it("returns different instances for different targets", () => {
      const target1 = {};
      const target2 = {};
      const validator1 = Validator.get(target1);
      const validator2 = Validator.get(target2);
      expect(validator1).not.toBe(validator2);
      expect(validator1.id).not.toBe(validator2.id);
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

  describe("#firstErrorMessage", () => {
    it("calls findErrors() internally", () => {
      const validator = Validator.get({});
      const spy = vi.spyOn(validator, "findErrors");
      void validator.firstErrorMessage;
      expect(spy).toBeCalledWith(KeyPathSelf, true);
    });

    it("returns null when there are no errors", () => {
      const validator = Validator.get({});
      expect(validator.firstErrorMessage).toBeNull();
    });

    it("returns the first error message", () => {
      const validator = Validator.get({ field1: 0, field2: 0 });
      validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
        builder.invalidate("field2", "invalid2");
      });
      expect(validator.firstErrorMessage).toBe("invalid1");
    });
  });

  describe("#getErrorMessages", () => {
    it("calls findErrors() internally", () => {
      const validator = Validator.get({});
      const spy = vi.spyOn(validator, "findErrors");

      validator.getErrorMessages(KeyPathSelf);
      expect(spy).nthCalledWith(1, KeyPathSelf, false);

      validator.getErrorMessages(KeyPathSelf, true);
      expect(spy).nthCalledWith(2, KeyPathSelf, true);

      validator.getErrorMessages("field1" as KeyPath);
      expect(spy).nthCalledWith(3, "field1" as KeyPath, false);

      validator.getErrorMessages("field1" as KeyPath, true);
      expect(spy).nthCalledWith(4, "field1" as KeyPath, true);
    });

    it("returns an empty set when there are no errors", () => {
      const validator = Validator.get({});
      expect(validator.getErrorMessages(KeyPathSelf)).toEqual(new Set());
    });

    it("returns a set of error messages", () => {
      const validator = Validator.get({ field1: 0, field2: 0 });
      validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
        builder.invalidate("field2", "invalid2");
        builder.invalidate("field2", "invalid3");
      });
      expect(validator.getErrorMessages(KeyPathSelf)).toEqual(new Set(["invalid1", "invalid2", "invalid3"]));
      expect(validator.getErrorMessages("field1" as KeyPath)).toEqual(new Set(["invalid1"]));
      expect(validator.getErrorMessages("field2" as KeyPath)).toEqual(new Set(["invalid2", "invalid3"]));
    });
  });

  describe("#hasErrors", () => {
    it("calls findErrors() internally", () => {
      const validator = Validator.get({});
      const spy = vi.spyOn(validator, "findErrors");

      validator.hasErrors(KeyPathSelf);
      expect(spy).nthCalledWith(1, KeyPathSelf, false);

      validator.hasErrors(KeyPathSelf, true);
      expect(spy).nthCalledWith(2, KeyPathSelf, true);

      validator.hasErrors("field1" as KeyPath);
      expect(spy).nthCalledWith(3, "field1" as KeyPath, false);

      validator.hasErrors("field1" as KeyPath, true);
      expect(spy).nthCalledWith(4, "field1" as KeyPath, true);
    });

    it("returns false when there are no errors", () => {
      const validator = Validator.get({});
      expect(validator.hasErrors(KeyPathSelf)).toBe(false);
    });

    it("returns true when there are errors", () => {
      const validator = Validator.get({ field1: 0, field2: 0 });
      validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
      });
      expect(validator.hasErrors(KeyPathSelf)).toBe(true);
      expect(validator.hasErrors("field1" as KeyPath)).toBe(true);
      expect(validator.hasErrors("field2" as KeyPath)).toBe(false);
    });
  });

  describe("#findErrors", () => {
    class Parent {
      a = false;
      b = false;
      @nested.hoist hoist = new Child();
      @nested child = new Child();
      @nested children = [new Child()];
    }

    class Child {
      aa = false;
      bb = false;
      @nested.hoist arrayHoist = [new Grandchild()];
      @nested grandchild = new Grandchild();
      @nested grandchildren = [new Grandchild()];
    }

    class Grandchild {
      aaa = false;
      bbb = false;
    }

    const setupEnv = (opt?: { clean?: boolean }) => {
      const parent = new Parent();
      const validators = {
        parent: Validator.get(parent),
        "parent.hoist": Validator.get(parent.hoist),
        "parent.child": Validator.get(parent.child),
        "parent.child.arrayHoist.0": Validator.get(parent.child.arrayHoist[0]),
        "parent.child.grandchild": Validator.get(parent.child.grandchild),
        "parent.child.grandchildren.0": Validator.get(parent.child.grandchildren[0]),
        "parent.children.0": Validator.get(parent.children[0]),
        "parent.children.0.grandchildren.0": Validator.get(parent.children[0].grandchildren[0]),
      };

      if (!opt?.clean) {
        validators["parent"].updateErrors(Symbol(), (builder) => {
          // builder.invalidateSelf("invalid self at parent");
          builder.invalidate("a", "invalid at parent.a");
          builder.invalidate("b", "invalid at parent.b");
          builder.invalidate("child", "invalid at parent.child");
          builder.invalidate("children", "invalid at parent.children");
        });
        validators["parent.hoist"].updateErrors(Symbol(), (builder) => {
          // builder.invalidateSelf("invalid self at parent.(hoist)");
          builder.invalidate("aa", "invalid at parent.(hoist).aa");
          builder.invalidate("bb", "invalid at parent.(hoist).bb");
        });
        validators["parent.child"].updateErrors(Symbol(), (builder) => {
          // builder.invalidateSelf("invalid self at parent.child");
          builder.invalidate("aa", "invalid at parent.child.aa");
          builder.invalidate("bb", "invalid at parent.child.bb");
          builder.invalidate("grandchild", "invalid at parent.child.grandchild");
          builder.invalidate("grandchildren", "invalid at parent.child.grandchildren");
        });
        validators["parent.child.arrayHoist.0"].updateErrors(Symbol(), (builder) => {
          // builder.invalidateSelf("invalid self at parent.child.(arrayHoist).0");
          builder.invalidate("aaa", "invalid at parent.child.(arrayHoist).0.aaa");
          builder.invalidate("bbb", "invalid at parent.child.(arrayHoist).0.bbb");
        });
        validators["parent.child.grandchild"].updateErrors(Symbol(), (builder) => {
          // builder.invalidateSelf("invalid self at parent.child.grandchild");
          builder.invalidate("aaa", "invalid at parent.child.grandchild.aaa");
          builder.invalidate("bbb", "invalid at parent.child.grandchild.bbb");
        });
        validators["parent.children.0"].updateErrors(Symbol(), (builder) => {
          // builder.invalidateSelf("invalid self at parent.children.0");
          builder.invalidate("aa", "invalid at parent.children.0.aa");
          builder.invalidate("bb", "invalid at parent.children.0.bb");
        });
        validators["parent.children.0.grandchildren.0"].updateErrors(Symbol(), (builder) => {
          // builder.invalidateSelf("invalid self at parent.children.0.grandchildren.0");
          builder.invalidate("aaa", "invalid at parent.children.0.grandchildren.0.aaa");
          builder.invalidate("bbb", "invalid at parent.children.0.grandchildren.0.bbb");
        });
        validators["parent.child.grandchildren.0"].updateErrors(Symbol(), (builder) => {
          // builder.invalidateSelf("invalid self at parent.child.grandchildren.0");
          builder.invalidate("aaa", "invalid at parent.child.grandchildren.0.aaa");
          builder.invalidate("bbb", "invalid at parent.child.grandchildren.0.bbb");
        });
      }

      return validators;
    };

    describe("Search with a self path", () => {
      it("returns an empty iterator when there are no errors", () => {
        const env = setupEnv({ clean: true });
        expect(buildErrorMap(env["parent"].findErrors(KeyPathSelf))).toEqual(new Map());
      });

      it("returns own errors", () => {
        const env = setupEnv();
        expect(buildErrorMap(env["parent"].findErrors(KeyPathSelf))).toMatchInlineSnapshot(`
          Map {
            "a" => [
              "invalid at parent.a",
            ],
            "b" => [
              "invalid at parent.b",
            ],
            "child" => [
              "invalid at parent.child",
            ],
            "children" => [
              "invalid at parent.children",
            ],
            "aa" => [
              "invalid at parent.(hoist).aa",
            ],
            "bb" => [
              "invalid at parent.(hoist).bb",
            ],
          }
        `);
        expect(buildErrorMap(env["parent.child"].findErrors(KeyPathSelf))).toMatchInlineSnapshot(`
          Map {
            "aa" => [
              "invalid at parent.child.aa",
            ],
            "bb" => [
              "invalid at parent.child.bb",
            ],
            "grandchild" => [
              "invalid at parent.child.grandchild",
            ],
            "grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "aaa" => [
              "invalid at parent.child.(arrayHoist).0.aaa",
            ],
            "bbb" => [
              "invalid at parent.child.(arrayHoist).0.bbb",
            ],
          }
        `);
      });

      it("returns all errors with prefix match", () => {
        const env = setupEnv();
        expect(buildErrorMap(env["parent"].findErrors(KeyPathSelf, true))).toMatchInlineSnapshot(`
          Map {
            "a" => [
              "invalid at parent.a",
            ],
            "b" => [
              "invalid at parent.b",
            ],
            "child" => [
              "invalid at parent.child",
            ],
            "children" => [
              "invalid at parent.children",
            ],
            "aa" => [
              "invalid at parent.(hoist).aa",
            ],
            "bb" => [
              "invalid at parent.(hoist).bb",
            ],
            "child.aa" => [
              "invalid at parent.child.aa",
            ],
            "child.bb" => [
              "invalid at parent.child.bb",
            ],
            "child.grandchild" => [
              "invalid at parent.child.grandchild",
            ],
            "child.grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "child.0.aaa" => [
              "invalid at parent.child.(arrayHoist).0.aaa",
            ],
            "child.0.bbb" => [
              "invalid at parent.child.(arrayHoist).0.bbb",
            ],
            "child.grandchild.aaa" => [
              "invalid at parent.child.grandchild.aaa",
            ],
            "child.grandchild.bbb" => [
              "invalid at parent.child.grandchild.bbb",
            ],
            "child.grandchildren.0.aaa" => [
              "invalid at parent.child.grandchildren.0.aaa",
            ],
            "child.grandchildren.0.bbb" => [
              "invalid at parent.child.grandchildren.0.bbb",
            ],
            "children.0.aa" => [
              "invalid at parent.children.0.aa",
            ],
            "children.0.bb" => [
              "invalid at parent.children.0.bb",
            ],
            "children.0.grandchildren.0.aaa" => [
              "invalid at parent.children.0.grandchildren.0.aaa",
            ],
            "children.0.grandchildren.0.bbb" => [
              "invalid at parent.children.0.grandchildren.0.bbb",
            ],
          }
        `);
        expect(buildErrorMap(env["parent.child"].findErrors(KeyPathSelf, true))).toMatchInlineSnapshot(`
          Map {
            "aa" => [
              "invalid at parent.child.aa",
            ],
            "bb" => [
              "invalid at parent.child.bb",
            ],
            "grandchild" => [
              "invalid at parent.child.grandchild",
            ],
            "grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "0.aaa" => [
              "invalid at parent.child.(arrayHoist).0.aaa",
            ],
            "0.bbb" => [
              "invalid at parent.child.(arrayHoist).0.bbb",
            ],
            "grandchild.aaa" => [
              "invalid at parent.child.grandchild.aaa",
            ],
            "grandchild.bbb" => [
              "invalid at parent.child.grandchild.bbb",
            ],
            "grandchildren.0.aaa" => [
              "invalid at parent.child.grandchildren.0.aaa",
            ],
            "grandchildren.0.bbb" => [
              "invalid at parent.child.grandchildren.0.bbb",
            ],
          }
        `);
      });
    });

    describe("Search for a specific path", () => {
      it("returns an empty iterator when there are no errors", () => {
        const env = setupEnv({ clean: true });
        expect(buildErrorMap(env["parent"].findErrors(KeyPathSelf))).toEqual(new Map());
      });

      it("returns errors for the specific path", () => {
        const env = setupEnv();
        expect(buildErrorMap(env["parent"].findErrors("child" as KeyPath))).toMatchInlineSnapshot(`
          Map {
            "child" => [
              "invalid at parent.child",
            ],
            "child.aa" => [
              "invalid at parent.child.aa",
            ],
            "child.bb" => [
              "invalid at parent.child.bb",
            ],
            "child.grandchild" => [
              "invalid at parent.child.grandchild",
            ],
            "child.grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "child.aaa" => [
              "invalid at parent.child.(arrayHoist).0.aaa",
            ],
            "child.bbb" => [
              "invalid at parent.child.(arrayHoist).0.bbb",
            ],
          }
        `);

        expect(buildErrorMap(env["parent"].findErrors("child.aa" as KeyPath))).toMatchInlineSnapshot(`
          Map {
            "child.aa" => [
              "invalid at parent.child.aa",
            ],
          }
        `);

        expect(buildErrorMap(env["parent"].findErrors("child.grandchildren" as KeyPath))).toMatchInlineSnapshot(`
          Map {
            "child.grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
          }
        `);

        expect(buildErrorMap(env["parent"].findErrors("child.grandchildren.0" as KeyPath))).toMatchInlineSnapshot(`
          Map {
            "child.grandchildren.0.aaa" => [
              "invalid at parent.child.grandchildren.0.aaa",
            ],
            "child.grandchildren.0.bbb" => [
              "invalid at parent.child.grandchildren.0.bbb",
            ],
          }
        `);
      });

      it("returns all errors for the specific path with prefix match", () => {
        const env = setupEnv();
        expect(buildErrorMap(env["parent"].findErrors("child" as KeyPath, true))).toMatchInlineSnapshot(`
          Map {
            "child" => [
              "invalid at parent.child",
            ],
            "child.aa" => [
              "invalid at parent.child.aa",
            ],
            "child.bb" => [
              "invalid at parent.child.bb",
            ],
            "child.grandchild" => [
              "invalid at parent.child.grandchild",
            ],
            "child.grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "child.0.aaa" => [
              "invalid at parent.child.(arrayHoist).0.aaa",
            ],
            "child.0.bbb" => [
              "invalid at parent.child.(arrayHoist).0.bbb",
            ],
            "child.grandchild.aaa" => [
              "invalid at parent.child.grandchild.aaa",
            ],
            "child.grandchild.bbb" => [
              "invalid at parent.child.grandchild.bbb",
            ],
            "child.grandchildren.0.aaa" => [
              "invalid at parent.child.grandchildren.0.aaa",
            ],
            "child.grandchildren.0.bbb" => [
              "invalid at parent.child.grandchildren.0.bbb",
            ],
          }
        `);

        expect(buildErrorMap(env["parent"].findErrors("child.aa" as KeyPath, true))).toMatchInlineSnapshot(`
          Map {
            "child.aa" => [
              "invalid at parent.child.aa",
            ],
          }
        `);

        expect(buildErrorMap(env["parent"].findErrors("child.grandchildren" as KeyPath, true))).toMatchInlineSnapshot(`
          Map {
            "child.grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "child.grandchildren.0.aaa" => [
              "invalid at parent.child.grandchildren.0.aaa",
            ],
            "child.grandchildren.0.bbb" => [
              "invalid at parent.child.grandchildren.0.bbb",
            ],
          }
        `);
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

    it("can resume handlers after reset", async () => {
      const env = setupEnv({ syncHandler: true });

      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      env.validator.reset();
      expect(env.validator.reactionState).toBe(0);

      runInAction(() => {
        env.model.field1++;
      });
      expect(env.validator.reactionState).toBe(1);
      await env.waitForReactionState(0);
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
