import { getEventListeners } from "node:events";
import { autorun, getObserverTree, IEqualsComparer, makeObservable, observable, runInAction } from "mobx";
import { Validator, makeValidatable } from "./validator";
import { nested } from "./nested";
import { KeyPath } from "./keyPath";
import { ValidationError, ValidationErrorMapBuilder } from "./error";

/** MobX's "Cycle detected in computation" error, which its production build only gives the number of */
const mobxCycleError = /Cycle detected in computation|minified error nr: 32 /;

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
      expect(buildErrorMap(validator.findErrors(KeyPath.Self))).toEqual(new Map());
    });

    it("updates the errors instantly", () => {
      const validator = Validator.get({ sample: false });
      const symbol = Symbol();
      validator.updateErrors(symbol, (builder) => {
        builder.invalidate("sample", "invalid");
      });
      expect(buildErrorMap(validator.findErrors(KeyPath.Self))).toEqual(new Map([["sample", ["invalid"]]]));
    });

    it("removes the errors by calling the returned function", () => {
      const validator = Validator.get({ sample: false });
      const symbol = Symbol();
      const dispose = validator.updateErrors(symbol, (builder) => {
        builder.invalidate("sample", "invalid");
      });
      dispose();
      expect(buildErrorMap(validator.findErrors(KeyPath.Self))).toEqual(new Map());
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
      expect(buildErrorMap(validator.findErrors(KeyPath.Self))).toEqual(new Map([["sample", ["invalid2"]]]));
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
      expect(buildErrorMap(validator.findErrors(KeyPath.Self))).toEqual(
        new Map([["sample", ["invalid1", "invalid2"]]])
      );
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
      expect(buildErrorMap(validator.findErrors(KeyPath.Self))).toEqual(new Map([["sample", ["invalid2"]]]));
      dispose2();
      expect(buildErrorMap(validator.findErrors(KeyPath.Self))).toEqual(new Map());
    });
  });

  describe("#firstErrorMessage", () => {
    it("calls findErrors() internally", () => {
      const validator = Validator.get({});
      const spy = vi.spyOn(validator, "findErrors");
      void validator.firstErrorMessage;
      expect(spy).toBeCalledWith(KeyPath.Self, true);
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

      validator.getErrorMessages(KeyPath.Self);
      expect(spy).nthCalledWith(1, KeyPath.Self, false);

      validator.getErrorMessages(KeyPath.Self, true);
      expect(spy).nthCalledWith(2, KeyPath.Self, true);

      validator.getErrorMessages("field1" as KeyPath);
      expect(spy).nthCalledWith(3, "field1" as KeyPath, false);

      validator.getErrorMessages("field1" as KeyPath, true);
      expect(spy).nthCalledWith(4, "field1" as KeyPath, true);
    });

    it("returns an empty set when there are no errors", () => {
      const validator = Validator.get({});
      expect(validator.getErrorMessages(KeyPath.Self)).toEqual(new Set());
    });

    it("returns a set of error messages", () => {
      const validator = Validator.get({ field1: 0, field2: 0 });
      validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
        builder.invalidate("field2", "invalid2");
        builder.invalidate("field2", "invalid3");
      });
      expect(validator.getErrorMessages(KeyPath.Self)).toEqual(new Set(["invalid1", "invalid2", "invalid3"]));
      expect(validator.getErrorMessages("field1" as KeyPath)).toEqual(new Set(["invalid1"]));
      expect(validator.getErrorMessages("field2" as KeyPath)).toEqual(new Set(["invalid2", "invalid3"]));
    });
  });

  describe("#hasErrors", () => {
    it("calls findErrors() internally", () => {
      const validator = Validator.get({});
      const spy = vi.spyOn(validator, "findErrors");

      validator.hasErrors(KeyPath.Self);
      expect(spy).nthCalledWith(1, KeyPath.Self, false);

      validator.hasErrors(KeyPath.Self, true);
      expect(spy).nthCalledWith(2, KeyPath.Self, true);

      validator.hasErrors("field1" as KeyPath);
      expect(spy).nthCalledWith(3, "field1" as KeyPath, false);

      validator.hasErrors("field1" as KeyPath, true);
      expect(spy).nthCalledWith(4, "field1" as KeyPath, true);
    });

    it("returns false when there are no errors", () => {
      const validator = Validator.get({});
      expect(validator.hasErrors(KeyPath.Self)).toBe(false);
    });

    it("returns true when there are errors", () => {
      const validator = Validator.get({ field1: 0, field2: 0 });
      validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
      });
      expect(validator.hasErrors(KeyPath.Self)).toBe(true);
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
          builder.invalidateSelf("invalid self at parent");
          builder.invalidate("a", "invalid at parent.a");
          builder.invalidate("b", "invalid at parent.b");
          builder.invalidate("child", "invalid at parent.child");
          builder.invalidate("children", "invalid at parent.children");
        });
        validators["parent.hoist"].updateErrors(Symbol(), (builder) => {
          builder.invalidateSelf("invalid self at parent.(hoist)");
          builder.invalidate("aa", "invalid at parent.(hoist).aa");
          builder.invalidate("bb", "invalid at parent.(hoist).bb");
        });
        validators["parent.child"].updateErrors(Symbol(), (builder) => {
          builder.invalidateSelf("invalid self at parent.child");
          builder.invalidate("aa", "invalid at parent.child.aa");
          builder.invalidate("bb", "invalid at parent.child.bb");
          builder.invalidate("grandchild", "invalid at parent.child.grandchild");
          builder.invalidate("grandchildren", "invalid at parent.child.grandchildren");
        });
        validators["parent.child.arrayHoist.0"].updateErrors(Symbol(), (builder) => {
          builder.invalidateSelf("invalid self at parent.child.(arrayHoist).0");
          builder.invalidate("aaa", "invalid at parent.child.(arrayHoist).0.aaa");
          builder.invalidate("bbb", "invalid at parent.child.(arrayHoist).0.bbb");
        });
        validators["parent.child.grandchild"].updateErrors(Symbol(), (builder) => {
          builder.invalidateSelf("invalid self at parent.child.grandchild");
          builder.invalidate("aaa", "invalid at parent.child.grandchild.aaa");
          builder.invalidate("bbb", "invalid at parent.child.grandchild.bbb");
        });
        validators["parent.children.0"].updateErrors(Symbol(), (builder) => {
          builder.invalidateSelf("invalid self at parent.children.0");
          builder.invalidate("aa", "invalid at parent.children.0.aa");
          builder.invalidate("bb", "invalid at parent.children.0.bb");
        });
        validators["parent.children.0.grandchildren.0"].updateErrors(Symbol(), (builder) => {
          builder.invalidateSelf("invalid self at parent.children.0.grandchildren.0");
          builder.invalidate("aaa", "invalid at parent.children.0.grandchildren.0.aaa");
          builder.invalidate("bbb", "invalid at parent.children.0.grandchildren.0.bbb");
        });
        validators["parent.child.grandchildren.0"].updateErrors(Symbol(), (builder) => {
          builder.invalidateSelf("invalid self at parent.child.grandchildren.0");
          builder.invalidate("aaa", "invalid at parent.child.grandchildren.0.aaa");
          builder.invalidate("bbb", "invalid at parent.child.grandchildren.0.bbb");
        });
      }

      return validators;
    };

    describe("Search with a self path", () => {
      it("returns an empty iterator when there are no errors", () => {
        const env = setupEnv({ clean: true });
        expect(buildErrorMap(env["parent"].findErrors(KeyPath.Self))).toEqual(new Map());
      });

      it("returns own errors", () => {
        const env = setupEnv();
        expect(buildErrorMap(env["parent"].findErrors(KeyPath.Self))).toMatchInlineSnapshot(`
          Map {
            Symbol(self) => [
              "invalid self at parent",
              "invalid self at parent.(hoist)",
            ],
            "a" => [
              "invalid at parent.a",
            ],
            "b" => [
              "invalid at parent.b",
            ],
            "child" => [
              "invalid at parent.child",
              "invalid self at parent.child",
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
        expect(buildErrorMap(env["parent.child"].findErrors(KeyPath.Self))).toMatchInlineSnapshot(`
          Map {
            Symbol(self) => [
              "invalid self at parent.child",
            ],
            "aa" => [
              "invalid at parent.child.aa",
            ],
            "bb" => [
              "invalid at parent.child.bb",
            ],
            "grandchild" => [
              "invalid at parent.child.grandchild",
              "invalid self at parent.child.grandchild",
            ],
            "grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "0" => [
              "invalid self at parent.child.(arrayHoist).0",
            ],
          }
        `);
      });

      it("returns all errors with prefix match", () => {
        const env = setupEnv();
        expect(buildErrorMap(env["parent"].findErrors(KeyPath.Self, true))).toMatchInlineSnapshot(`
          Map {
            Symbol(self) => [
              "invalid self at parent",
              "invalid self at parent.(hoist)",
            ],
            "a" => [
              "invalid at parent.a",
            ],
            "b" => [
              "invalid at parent.b",
            ],
            "child" => [
              "invalid at parent.child",
              "invalid self at parent.child",
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
              "invalid self at parent.child.grandchild",
            ],
            "child.grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "child.0" => [
              "invalid self at parent.child.(arrayHoist).0",
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
            "child.grandchildren.0" => [
              "invalid self at parent.child.grandchildren.0",
            ],
            "child.grandchildren.0.aaa" => [
              "invalid at parent.child.grandchildren.0.aaa",
            ],
            "child.grandchildren.0.bbb" => [
              "invalid at parent.child.grandchildren.0.bbb",
            ],
            "children.0" => [
              "invalid self at parent.children.0",
            ],
            "children.0.aa" => [
              "invalid at parent.children.0.aa",
            ],
            "children.0.bb" => [
              "invalid at parent.children.0.bb",
            ],
            "children.0.grandchildren.0" => [
              "invalid self at parent.children.0.grandchildren.0",
            ],
            "children.0.grandchildren.0.aaa" => [
              "invalid at parent.children.0.grandchildren.0.aaa",
            ],
            "children.0.grandchildren.0.bbb" => [
              "invalid at parent.children.0.grandchildren.0.bbb",
            ],
          }
        `);
        expect(buildErrorMap(env["parent.child"].findErrors(KeyPath.Self, true))).toMatchInlineSnapshot(`
          Map {
            Symbol(self) => [
              "invalid self at parent.child",
            ],
            "aa" => [
              "invalid at parent.child.aa",
            ],
            "bb" => [
              "invalid at parent.child.bb",
            ],
            "grandchild" => [
              "invalid at parent.child.grandchild",
              "invalid self at parent.child.grandchild",
            ],
            "grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "0" => [
              "invalid self at parent.child.(arrayHoist).0",
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
            "grandchildren.0" => [
              "invalid self at parent.child.grandchildren.0",
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
        expect(buildErrorMap(env["parent"].findErrors(KeyPath.Self))).toEqual(new Map());
      });

      it("returns errors for the specific path", () => {
        const env = setupEnv();
        expect(buildErrorMap(env["parent"].findErrors("child" as KeyPath))).toMatchInlineSnapshot(`
          Map {
            "child" => [
              "invalid at parent.child",
              "invalid self at parent.child",
            ],
            "child.aa" => [
              "invalid at parent.child.aa",
            ],
            "child.bb" => [
              "invalid at parent.child.bb",
            ],
            "child.grandchild" => [
              "invalid at parent.child.grandchild",
              "invalid self at parent.child.grandchild",
            ],
            "child.grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "child.0" => [
              "invalid self at parent.child.(arrayHoist).0",
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
            "child.grandchildren.0" => [
              "invalid self at parent.child.grandchildren.0",
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

      it("returns all errors for the specific path with prefix match", () => {
        const env = setupEnv();
        expect(buildErrorMap(env["parent"].findErrors("child" as KeyPath, true))).toMatchInlineSnapshot(`
          Map {
            "child" => [
              "invalid at parent.child",
              "invalid self at parent.child",
            ],
            "child.aa" => [
              "invalid at parent.child.aa",
            ],
            "child.bb" => [
              "invalid at parent.child.bb",
            ],
            "child.grandchild" => [
              "invalid at parent.child.grandchild",
              "invalid self at parent.child.grandchild",
            ],
            "child.grandchildren" => [
              "invalid at parent.child.grandchildren",
            ],
            "child.0" => [
              "invalid self at parent.child.(arrayHoist).0",
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
            "child.grandchildren.0" => [
              "invalid self at parent.child.grandchildren.0",
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
            "child.grandchildren.0" => [
              "invalid self at parent.child.grandchildren.0",
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

      expect(buildErrorMap(env.validator.findErrors(KeyPath.Self))).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);
      expect(buildErrorMap(env.validator.findErrors(KeyPath.Self))).toEqual(new Map([["field1", ["invalid"]]]));
    });

    it("removes the errors when the condition is no longer met", async () => {
      const env = setupEnv({ syncHandler: true });

      expect(buildErrorMap(env.validator.findErrors(KeyPath.Self))).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);

      runInAction(() => {
        env.model.field1 = 0;
      });
      await env.waitForReactionState(0);
      expect(buildErrorMap(env.validator.findErrors(KeyPath.Self))).toEqual(new Map());
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

      expect(buildErrorMap(env.validator.findErrors(KeyPath.Self))).toEqual(new Map());
      runInAction(() => {
        env.model.field1 = -1;
      });
      await env.waitForReactionState(0);
      await env.waitForAsyncState(0);
      expect(buildErrorMap(env.validator.findErrors(KeyPath.Self))).toEqual(new Map([["field1", ["invalid"]]]));
    });

    it("removes the errors when the condition is no longer met", async () => {
      const env = setupEnv({ asyncHandler: true });

      expect(buildErrorMap(env.validator.findErrors(KeyPath.Self))).toEqual(new Map());
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
      expect(buildErrorMap(env.validator.findErrors(KeyPath.Self))).toEqual(new Map());
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

    it("works when called without the validator as `this`", () => {
      const env = setupEnv();
      env.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("field1", "invalid1");
      });

      // Bound, so that it can be passed as a callback as it is (e.g. `onClick={validator.reset}`)
      const { reset } = env.validator;
      reset();
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

  test("parent validator's isValidating reflects nested validators' validation state", async () => {
    class AsyncSample {
      @observable field = true;
      delayMs: number;

      constructor(delayMs: number) {
        this.delayMs = delayMs;
        makeObservable(this);

        makeValidatable(
          this,
          () => this.field,
          async (value, b) => {
            await new Promise((resolve) => setTimeout(resolve, this.delayMs));
            if (!value) {
              b.invalidate("field", "invalid");
            }
          }
        );
      }
    }

    class ParentWithMultipleAsyncNested {
      @nested @observable sample1 = new AsyncSample(50);
      @nested @observable sample2 = new AsyncSample(150);

      constructor() {
        makeObservable(this);
      }
    }

    const parent = new ParentWithMultipleAsyncNested();
    const parentValidator = Validator.get(parent);
    const sample1Validator = Validator.get(parent.sample1);
    const sample2Validator = Validator.get(parent.sample2);

    // Wait for initial validation
    await vi.waitFor(() => {
      expect(parentValidator.isValidating).toBe(false);
    });

    // Trigger validation on both nested objects
    runInAction(() => {
      parent.sample1.field = false;
      parent.sample2.field = false;
    });

    // All should be validating
    await vi.waitFor(() => {
      expect(sample1Validator.isValidating).toBe(true);
      expect(sample2Validator.isValidating).toBe(true);
    });
    expect(parentValidator.isValidating).toBe(true);

    // Wait for sample1 to complete (50ms), but sample2 is still running (150ms)
    await vi.waitFor(() => {
      expect(sample1Validator.isValidating).toBe(false);
    });

    // Parent should still be validating because sample2 is still running
    expect(sample2Validator.isValidating).toBe(true);
    expect(parentValidator.isValidating).toBe(true);

    // Wait for sample2 to complete
    await vi.waitFor(() => {
      expect(sample2Validator.isValidating).toBe(false);
    });

    // Now parent should also be done
    expect(parentValidator.isValidating).toBe(false);
  });
});

/** Collect `[keyPath, message]` pairs in iteration order */
function listErrors(iter: Iterable<[KeyPath, ValidationError]>) {
  return Array.from(iter, ([keyPath, error]) => [keyPath, error.message]);
}

/** A promise whose settlement is controlled by the test */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let settled promises propagate without advancing the fake clock */
function flushMicrotasks() {
  return vi.advanceTimersByTimeAsync(0);
}

/** A model with a sync handler that invalidates `field` when it's negative */
function setupSyncHandler(opt?: Validator.HandlerOptions, initialValue = 0) {
  const model = observable({ field: initialValue, other: 0 });
  const validator = Validator.get(model);
  const seen: number[] = [];
  const dispose = validator.addSyncHandler((b) => {
    seen.push(model.field);
    if (model.field < 0) {
      b.invalidate("field", `negative: ${model.field}`);
    }
  }, opt);
  return { model, validator, seen, dispose };
}

/** A model with an async handler whose jobs are settled manually by the test */
function setupAsyncHandler(opt?: Validator.HandlerOptions<number>, initialValue = 0) {
  const model = observable({ field: initialValue });
  const validator = Validator.get(model);
  const runs: Array<{ payload: number; signal: AbortSignal; job: ReturnType<typeof deferred> }> = [];
  const dispose = validator.addAsyncHandler(
    () => model.field,
    async (payload, b, signal) => {
      const job = deferred();
      runs.push({ payload, signal, job });
      await job.promise;
      if (payload < 0) {
        b.invalidate("field", `negative: ${payload}`);
      }
    },
    opt
  );
  return { model, validator, runs, dispose };
}

describe("makeValidatable: dispatch and return value", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards the handler and options to addSyncHandler and returns its disposer", () => {
    const target = { field: 0 };
    const validator = Validator.get(target);
    const dispose = vi.fn();
    const spy = vi.spyOn(validator, "addSyncHandler").mockReturnValue(dispose);
    const handler = () => {};
    const opt = { initialRun: false, delayMs: 10 };

    expect(makeValidatable(target, handler, opt)).toBe(dispose);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(handler, opt);
  });

  it("forwards the expression, handler and options to addAsyncHandler and returns its disposer", () => {
    const target = { field: 0 };
    const validator = Validator.get(target);
    const dispose = vi.fn();
    const spy = vi.spyOn(validator, "addAsyncHandler").mockReturnValue(dispose);
    const expr = () => target.field;
    const handler = async () => {};
    const opt = { initialRun: false };

    expect(makeValidatable(target, expr, handler, opt)).toBe(dispose);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expr, handler, opt);
  });

  it("returns a disposer that removes the errors of a sync handler", () => {
    const target = observable({ field: -1 });
    const dispose = makeValidatable(target, (b) => {
      if (target.field < 0) b.invalidate("field", "negative");
    });
    const validator = Validator.get(target);
    expect(validator.invalidKeys).toEqual(new Set(["field"]));

    dispose();
    expect(validator.isValid).toBe(true);
  });

  it("returns a disposer that removes the errors of an async handler", async () => {
    const target = observable({ field: -1 });
    const dispose = makeValidatable(
      target,
      () => target.field,
      async (field, b) => {
        if (field < 0) b.invalidate("field", "negative");
      }
    );
    const validator = Validator.get(target);
    await flushMicrotasks();
    expect(validator.invalidKeys).toEqual(new Set(["field"]));

    dispose();
    expect(validator.isValid).toBe(true);
    expect(validator.isValidating).toBe(false);
  });
});

describe("Validator.get / Validator.getSafe: targets", () => {
  it("returns null from getSafe for primitives and functions", () => {
    expect(Validator.getSafe(undefined)).toBeNull();
    expect(Validator.getSafe("str")).toBeNull();
    expect(Validator.getSafe(true)).toBeNull();
    expect(Validator.getSafe(0)).toBeNull();
    expect(Validator.getSafe(10n)).toBeNull();
    expect(Validator.getSafe(Symbol())).toBeNull();
    expect(Validator.getSafe(() => {})).toBeNull();
  });

  it("throws a TypeError from get for non-objects", () => {
    expect(() => Validator.get(undefined as any)).toThrow(TypeError);
    expect(() => Validator.get("str" as any)).toThrow(new TypeError("target: Expected an object"));
  });

  it("throws from get for functions although the signature accepts them", () => {
    const fn = () => {};
    // PINNED(bug): Validator.get(fn) type-checks (T extends object includes functions) but throws "target: Expected an object" at runtime. Expected: the signature and the runtime check agree (reject functions at the type level, or support them). Flip this assertion when fixing.
    expect(() => Validator.get(fn)).toThrow(TypeError);
  });

  it("throws from getSafe for a non-extensible object", () => {
    const target = Object.freeze({ field: 1 });
    // PINNED(bug): getSafe() defines a symbol property on the target, which throws "Cannot define property Symbol(validator), object is not extensible" for frozen/sealed/non-extensible objects. Expected: getSafe never throws for objects ("returns null instead of throwing an error"); e.g. keep validators in a WeakMap or return null. Flip this assertion when fixing.
    expect(() => Validator.getSafe(target)).toThrow(TypeError);
  });

  it("shares the validator of a prototype with the objects inheriting from it", () => {
    const proto = {};
    const protoValidator = Validator.get(proto);

    class Model {}
    const classProtoValidator = Validator.get(Model.prototype);

    // PINNED(bug): The cached validator is read through the prototype chain, so Object.create(proto) and instances of a class whose prototype was passed to get() reuse that validator. Expected: every target gets its own validator ("Returns existing instance if one exists for the target"). Flip these assertions (toBe -> not.toBe) when fixing.
    expect(Validator.get(Object.create(proto) as object)).toBe(protoValidator);
    expect(Validator.get(new Model())).toBe(classProtoValidator);
  });

  it("creates separate validators for instances of the same class", () => {
    class Base {}
    class Derived extends Base {}
    expect(Validator.get(new Derived())).not.toBe(Validator.get(new Derived()));
  });

  it("supports arrays and observable object proxies", () => {
    const array: string[] = [];
    expect(Validator.get(array)).toBe(Validator.get(array));

    const proxy = observable({ field: 1 });
    const validator = Validator.get(proxy);
    expect(Validator.get(proxy)).toBe(validator);
    // A spread copies enumerable symbol properties, so the cached validator must not travel with it
    expect(Validator.get({ ...proxy })).not.toBe(validator);
  });

  it("does not add enumerable properties to the target", () => {
    const target = { field: 1 };
    const validator = Validator.get(target);
    expect(Object.keys(target)).toEqual(["field"]);
    expect(JSON.stringify(target)).toBe('{"field":1}');
    const symbols = Object.getOwnPropertySymbols(target);
    expect(symbols).toHaveLength(1);
    expect(Object.prototype.propertyIsEnumerable.call(target, symbols[0])).toBe(false);

    const copy = { ...target };
    expect(Validator.get(copy)).not.toBe(validator);
  });

  it("assigns a random id", () => {
    expect(Validator.get({}).id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("requires Validator as the receiver of the static methods", () => {
    const { get, getSafe } = Validator;
    // PINNED(quirk): The static methods use `this` (this.getSafe / new this()), so calling them detached throws a TypeError. Decide: should they reference Validator explicitly so `const { get } = Validator` works?
    expect(() => get({})).toThrow(TypeError);
    expect(() => getSafe({})).toThrow(TypeError);
  });
});

describe("Validator: error bookkeeping", () => {
  describe("#updateErrors", () => {
    it("propagates an exception thrown by the handler and keeps the previous errors of the key", () => {
      const validator = Validator.get({ field: 0 });
      const key = Symbol();
      validator.updateErrors(key, (b) => b.invalidate("field", "kept"));

      expect(() =>
        validator.updateErrors(key, (b) => {
          b.invalidate("field", "discarded");
          throw new Error("handler failure");
        })
      ).toThrow("handler failure");
      expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["kept"]));
    });

    it("removes the existing errors of the key when the handler reports none", () => {
      const validator = Validator.get({ field: 0 });
      const key = Symbol();
      validator.updateErrors(key, (b) => b.invalidate("field", "invalid"));

      validator.updateErrors(key, () => {});
      expect(validator.isValid).toBe(true);
      expect(validator.invalidKeyCount).toBe(0);
    });

    it("lets a stale disposer remove the errors set by a later call with the same key", () => {
      const validator = Validator.get({ field1: 0, field2: 0 });
      const key = Symbol();
      const staleDispose = validator.updateErrors(key, (b) => b.invalidate("field1", "first"));
      validator.updateErrors(key, (b) => b.invalidate("field2", "second"));

      staleDispose();
      // PINNED(quirk): A disposer deletes whatever is stored under its key, including errors from a later updateErrors() call with the same key. Decide: should a disposer only remove the errors of the call that returned it?
      expect(validator.hasErrors("field2" as KeyPath)).toBe(false);
    });

    it("keeps an Error reason as the cause of the validation error", () => {
      const validator = Validator.get({ field: 0 });
      const reason = new Error("from an Error");
      validator.updateErrors(Symbol(), (b) => b.invalidate("field", reason));

      const [[keyPath, error]] = [...validator.findErrors("field" as KeyPath)];
      expect(keyPath).toBe("field");
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe("from an Error");
      expect(error.cause).toBe(reason);
      expect(error.key).toBe("field");
      expect(error.keyPath).toBe("field");
    });

    it("does not notify observers of isValid or invalidKeys when only the messages change", () => {
      const validator = Validator.get({ field: 0 });
      const key = Symbol();
      validator.updateErrors(key, (b) => b.invalidate("field", "message 1"));

      const isValidObserver = vi.fn();
      const invalidKeysObserver = vi.fn();
      const disposers = [
        autorun(() => isValidObserver(validator.isValid)),
        autorun(() => invalidKeysObserver(validator.invalidKeys)),
      ];

      validator.updateErrors(key, (b) => b.invalidate("field", "message 2"));
      expect(isValidObserver).toHaveBeenCalledTimes(1);
      expect(invalidKeysObserver).toHaveBeenCalledTimes(1);

      validator.updateErrors(key, () => {});
      expect(isValidObserver).toHaveBeenCalledTimes(2);
      expect(isValidObserver).toHaveBeenLastCalledWith(true);
      expect(invalidKeysObserver).toHaveBeenCalledTimes(2);

      for (const dispose of disposers) dispose();
    });
  });

  describe("ordering and duplicates", () => {
    it("groups errors by key path in first-insertion order and keeps duplicate messages as separate errors", () => {
      const validator = Validator.get({ a: 0, b: 0 });
      validator.updateErrors(Symbol(), (b) => {
        b.invalidate("a", "1");
        b.invalidate("b", "2");
        b.invalidate("a", "3");
        b.invalidate("a", "1");
        b.invalidateSelf("self");
      });

      expect(listErrors(validator.findErrors(KeyPath.Self))).toEqual([
        ["a", "1"],
        ["a", "3"],
        ["a", "1"],
        ["b", "2"],
        [KeyPath.Self, "self"],
      ]);
      expect(validator.getErrorMessages("a" as KeyPath)).toEqual(new Set(["1", "3"]));
      expect(validator.invalidKeyPathCount).toBe(3);
    });

    it("orders errors from different keys by when each key last became invalid", () => {
      const validator = Validator.get({ a: 0, b: 0 });
      const keyA = Symbol();
      const keyB = Symbol();
      validator.updateErrors(keyA, (b) => b.invalidate("a", "A1"));
      validator.updateErrors(keyB, (b) => b.invalidate("b", "B"));
      expect(validator.firstErrorMessage).toBe("A1");

      // Replacing non-empty errors keeps the position
      validator.updateErrors(keyA, (b) => b.invalidate("a", "A2"));
      expect(validator.firstErrorMessage).toBe("A2");

      validator.updateErrors(keyA, () => {});
      validator.updateErrors(keyA, (b) => b.invalidate("a", "A3"));
      // PINNED(quirk): A key whose errors were cleared and set again moves behind the other keys, so firstErrorMessage depends on the history of validity transitions rather than on handler/key registration order. Decide: should errors be ordered by the registration order of their source?
      expect(validator.firstErrorMessage).toBe("B");
    });

    it("moves the errors of a sync or async handler behind other handlers once they were cleared and reported again", async () => {
      vi.useFakeTimers();
      try {
        const model = observable({ a: -1, b: -1, c: -1 });
        const validator = Validator.get(model);
        validator.addSyncHandler((b) => {
          if (model.a < 0) b.invalidate("a", "A");
        });
        validator.addAsyncHandler(
          () => model.b,
          async (value, b) => {
            if (value < 0) b.invalidate("b", "B");
          }
        );
        validator.addSyncHandler((b) => {
          if (model.c < 0) b.invalidate("c", "C");
        });
        await flushMicrotasks();
        expect(validator.getErrorMessages(KeyPath.Self)).toEqual(new Set(["A", "C", "B"]));

        // Still invalid, but reported again: the position is kept
        runInAction(() => {
          model.a = -2;
        });
        await vi.advanceTimersByTimeAsync(100);
        expect(validator.firstErrorMessage).toBe("A");

        runInAction(() => {
          model.a = 0;
          model.b = 0;
        });
        await vi.advanceTimersByTimeAsync(100);
        expect(validator.getErrorMessages(KeyPath.Self)).toEqual(new Set(["C"]));
        runInAction(() => {
          model.a = -1;
          model.b = -1;
        });
        await vi.advanceTimersByTimeAsync(100);
        // PINNED(quirk): Same as for updateErrors(): a handler whose errors were cleared (its entry is deleted, not emptied) is re-inserted after the other handlers, so the first error message changes from "A" to "C". Decide: should errors be ordered by the registration order of their source?
        expect(listErrors(validator.findErrors(KeyPath.Self))).toEqual([
          ["c", "C"],
          ["a", "A"],
          ["b", "B"],
        ]);
        expect(validator.firstErrorMessage).toBe("C");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("#invalidKeys", () => {
    it("includes KeyPath.Self when the target itself is invalidated", () => {
      const validator = Validator.get({ field: 0 });
      validator.updateErrors(Symbol(), (b) => {
        b.invalidateSelf("self");
        b.invalidate("field", "field");
      });

      // PINNED(quirk): invalidKeys/invalidKeyCount count a self error as the key KeyPath.Self, while the docs describe invalidKeys as "direct property errors only". Decide: should self errors be excluded from invalidKeys and invalidKeyCount?
      expect(validator.invalidKeys).toEqual(new Set([KeyPath.Self, "field"]));
      expect(validator.invalidKeyCount).toBe(2);
    });

    it("returns a frozen Set whose contents can still be mutated", () => {
      const validator = Validator.get({ field: 0 });
      const observed: ReadonlySet<KeyPath>[] = [];
      const dispose = autorun(() => {
        observed.push(validator.invalidKeys);
      });
      const keys = observed[0];
      expect(Object.isFrozen(keys)).toBe(true);

      (keys as Set<KeyPath>).add("injected" as KeyPath);
      // PINNED(quirk): Object.freeze() does not protect a Set's entries, so a consumer casting away ReadonlySet can corrupt the cached computed value. Decide: return a truly immutable view (or a fresh copy)?
      expect(validator.invalidKeys.has("injected" as KeyPath)).toBe(true);
      dispose();
    });
  });

  describe("#getErrorMessages / #hasErrors", () => {
    it("treats an empty string key path as KeyPath.Self", () => {
      const validator = Validator.get({ field: 0 });
      validator.updateErrors(Symbol(), (b) => {
        b.invalidateSelf("self");
        b.invalidate("field", "field");
      });
      expect(validator.getErrorMessages("" as KeyPath)).toEqual(new Set(["self", "field"]));
      expect(validator.hasErrors("" as KeyPath)).toBe(true);
    });

    it("returns a new Set on every call", () => {
      const validator = Validator.get({ field: 0 });
      expect(validator.getErrorMessages(KeyPath.Self)).not.toBe(validator.getErrorMessages(KeyPath.Self));
    });

    it("returns nothing for a key path without errors", () => {
      const validator = Validator.get({ field1: 0, field2: 0 });
      validator.updateErrors(Symbol(), (b) => b.invalidate("field1", "invalid"));
      expect(validator.getErrorMessages("field2" as KeyPath, true)).toEqual(new Set());
      expect(validator.hasErrors("field2" as KeyPath, true)).toBe(false);
      expect(validator.hasErrors("field1.sub" as KeyPath, true)).toBe(false);
    });
  });
});

describe("Validator: sync handler scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses 100ms as the default delay", () => {
    expect(Validator.defaultDelayMs).toBe(100);

    const env = setupSyncHandler();
    runInAction(() => {
      env.model.field = -1;
    });
    vi.advanceTimersByTime(99);
    expect(env.validator.isValid).toBe(true);
    vi.advanceTimersByTime(1);
    expect(env.validator.isValid).toBe(false);
  });

  it("throttles: the first change starts the delay and later changes are folded into that run", () => {
    const env = setupSyncHandler({ initialRun: false });
    expect(env.seen).toEqual([0]); // evaluated once for tracking, without applying errors

    runInAction(() => {
      env.model.field = -1;
    });
    vi.advanceTimersByTime(60);
    runInAction(() => {
      env.model.field = -2;
    });
    vi.advanceTimersByTime(39);
    expect(env.seen).toEqual([0]);
    expect(env.validator.reactionState).toBe(1);

    vi.advanceTimersByTime(1);
    expect(env.seen).toEqual([0, -2]);
    expect(env.validator.reactionState).toBe(0);
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -2"]));

    runInAction(() => {
      env.model.field = -3;
    });
    vi.advanceTimersByTime(100);
    expect(env.seen).toEqual([0, -2, -3]);
  });

  it("honors the delayMs option", () => {
    const env = setupSyncHandler({ delayMs: 30 });
    runInAction(() => {
      env.model.field = -1;
    });
    vi.advanceTimersByTime(29);
    expect(env.validator.isValid).toBe(true);
    expect(env.validator.reactionState).toBe(1);

    vi.advanceTimersByTime(1);
    expect(env.validator.isValid).toBe(false);
    expect(env.validator.reactionState).toBe(0);
  });

  it("still defers to a timer when delayMs is 0", () => {
    const env = setupSyncHandler({ delayMs: 0 });
    runInAction(() => {
      env.model.field = -1;
    });
    expect(env.validator.reactionState).toBe(1);
    expect(env.validator.isValid).toBe(true);

    vi.advanceTimersByTime(0);
    expect(env.validator.reactionState).toBe(0);
    expect(env.validator.isValid).toBe(false);
  });

  it("captures Validator.defaultDelayMs when the handler is added", () => {
    const original = Validator.defaultDelayMs;
    try {
      Validator.defaultDelayMs = 30;
      const env = setupSyncHandler();
      Validator.defaultDelayMs = 500;

      runInAction(() => {
        env.model.field = -1;
      });
      vi.advanceTimersByTime(30);
      expect(env.validator.isValid).toBe(false);
    } finally {
      Validator.defaultDelayMs = original;
    }
  });

  it("does not schedule a reaction when an observable is set to its current value", () => {
    const env = setupSyncHandler();
    runInAction(() => {
      env.model.field = 0;
      env.model.other = 1;
    });
    expect(env.validator.reactionState).toBe(0);
    expect(env.seen).toEqual([0]);
  });

  it("counts pending reactions per handler", () => {
    const env = setupSyncHandler();
    env.validator.addSyncHandler(() => {
      void env.model.field;
    });

    runInAction(() => {
      env.model.field = 1;
    });
    expect(env.validator.reactionState).toBe(2);
    expect(env.validator.isValidating).toBe(true);

    vi.advanceTimersByTime(100);
    expect(env.validator.reactionState).toBe(0);
    expect(env.validator.isValidating).toBe(false);
  });

  it("defers the initial run until the outermost action ends", () => {
    const model = observable({ field: -1 });
    const validator = Validator.get(model);
    const handler = vi.fn();

    runInAction(() => {
      validator.addSyncHandler((b) => {
        handler();
        if (model.field < 0) b.invalidate("field", "negative");
      });
      expect(handler).not.toHaveBeenCalled();
      expect(validator.isValid).toBe(true);
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(validator.isValid).toBe(false);
  });
});

describe("Validator: sync handler failures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not propagate an exception thrown on the initial run", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    const failure = new Error("handler failure");

    expect(() =>
      validator.addSyncHandler(() => {
        if (model.field === 0) throw failure;
      })
    ).not.toThrow();
    expect(consoleError.mock.calls.some((args) => args.includes(failure))).toBe(true);
    // PINNED(quirk): After the handler fails on its initial run, the effect is still invoked with an undefined result and crashes with a TypeError, which MobX logs as a second error. Decide: should the effect skip failed evaluations?
    expect(consoleError.mock.calls.some((args) => args.some((arg) => arg instanceof TypeError))).toBe(true);
    expect(validator.isValid).toBe(true);
    expect(validator.reactionState).toBe(0);
  });

  it("leaves the validating state after the handler throws on a scheduled run", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    const failure = new Error("handler failure");
    validator.addSyncHandler((b) => {
      if (model.field === 1) throw failure;
      if (model.field < 0) b.invalidate("field", "negative");
    });

    runInAction(() => {
      model.field = -1;
    });
    vi.advanceTimersByTime(100);
    expect(validator.isValid).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();

    runInAction(() => {
      model.field = 1;
    });
    vi.advanceTimersByTime(100);
    expect(consoleError.mock.calls.some((args) => args.includes(failure))).toBe(true);
    // PINNED(quirk): The errors of the last successful run are kept when the handler throws. Decide: should a failing handler clear its errors, keep them, or surface the exception as an error?
    expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative"]));
    expect(validator.reactionState).toBe(0);
    expect(validator.isValidating).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(validator.reactionState).toBe(0);

    runInAction(() => {
      model.field = 2;
    });
    vi.advanceTimersByTime(100);
    expect(validator.reactionState).toBe(0);
    expect(validator.isValid).toBe(true);
  });
});

describe("Validator: async handler scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the initial job synchronously with the current value and a live signal", async () => {
    const env = setupAsyncHandler();
    expect(env.runs.map((run) => run.payload)).toEqual([0]);
    expect(env.runs[0].signal.aborted).toBe(false);
    expect(env.validator.asyncState).toBe(1);
    expect(env.validator.reactionState).toBe(0);

    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.asyncState).toBe(0);
    expect(env.runs[0].signal.aborted).toBe(false);
  });

  it("applies errors only after the handler settles", async () => {
    const model = observable({ field: -1 });
    const validator = Validator.get(model);
    const job = deferred();
    validator.addAsyncHandler(
      () => model.field,
      async (_, b) => {
        b.invalidate("field", "negative");
        await job.promise;
      }
    );
    await flushMicrotasks();
    expect(validator.isValid).toBe(true);
    expect(validator.isValidating).toBe(true);

    job.resolve();
    await flushMicrotasks();
    expect(validator.isValid).toBe(false);
    expect(validator.isValidating).toBe(false);
  });

  it("starts a job as soon as the reaction delay elapses when no job is running", async () => {
    const env = setupAsyncHandler({ initialRun: false, delayMs: 50 });
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(env.runs).toHaveLength(0);
    expect(env.validator.reactionState).toBe(1);
    expect(env.validator.asyncState).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(env.runs.map((run) => run.payload)).toEqual([-1]);
    expect(env.validator.reactionState).toBe(0);
    expect(env.validator.asyncState).toBe(1);

    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -1"]));
    expect(env.validator.asyncState).toBe(0);
  });

  it("lets the running job finish and then runs one follow-up job with the latest value", async () => {
    const env = setupAsyncHandler({ initialRun: false });
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs.map((run) => run.payload)).toEqual([-1]);

    runInAction(() => {
      env.model.field = -2;
    });
    await vi.advanceTimersByTimeAsync(100);
    runInAction(() => {
      env.model.field = -3;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs).toHaveLength(1);
    expect(env.validator.asyncState).toBe(1);
    // Intended: a newer value is queued behind the running job instead of aborting it
    expect(env.runs[0].signal.aborted).toBe(false);

    env.runs[0].job.resolve();
    await flushMicrotasks();
    // PINNED(quirk): The outdated job's result (for -1) is committed while the follow-up job for -3 is still pending, so an error for the old value shows until then. Decide: discard a completed run's result when a newer value is already queued?
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -1"]));
    expect(env.validator.asyncState).toBe(1); // scheduled

    await vi.advanceTimersByTimeAsync(99);
    expect(env.runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(env.runs.map((run) => run.payload)).toEqual([-1, -3]);

    env.runs[1].job.resolve();
    await flushMicrotasks();
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -3"]));
    expect(env.validator.asyncState).toBe(0);
    expect(env.validator.isValidating).toBe(false);
  });

  it("ignores the equals option", async () => {
    const model = observable({ field: 1 });
    const validator = Validator.get(model);
    const handler = vi.fn(async () => {});
    validator.addAsyncHandler(() => ({ positive: model.field > 0 }), handler, {
      equals: (a, b) => a.positive === b.positive,
    });
    await flushMicrotasks();
    expect(handler).toHaveBeenCalledTimes(1);

    runInAction(() => {
      model.field = 2;
    });
    // The reaction is scheduled when a dependency changes, before the expression is re-evaluated,
    // so this holds whether or not the comparer is honored.
    expect(validator.reactionState).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    // PINNED(bug): HandlerOptions.equals is documented as "The equality comparer for the expression" but is never passed to reaction(), so an expression result that is equal by the comparer still re-runs the handler. Expected: the handler is called only once (toHaveBeenCalledTimes(2) -> toHaveBeenCalledTimes(1)). Flip this assertion when fixing.
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("counts the job of each handler in asyncState", async () => {
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    const job1 = deferred();
    const job2 = deferred();
    validator.addAsyncHandler(
      () => model.field,
      () => job1.promise
    );
    validator.addAsyncHandler(
      () => model.field,
      () => job2.promise
    );
    expect(validator.asyncState).toBe(2);

    job1.resolve();
    await flushMicrotasks();
    expect(validator.asyncState).toBe(1);

    job2.resolve();
    await flushMicrotasks();
    expect(validator.asyncState).toBe(0);
  });
});

describe("Validator: async handler failures and cancellation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs an exception thrown by the handler and commits the errors collected before it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    const failure = new Error("handler failure");
    validator.addAsyncHandler(
      () => model.field,
      async (_, b) => {
        b.invalidate("field", "collected before the failure");
        throw failure;
      }
    );
    await flushMicrotasks();

    expect(consoleError).toHaveBeenCalledWith(failure);
    expect(validator.asyncState).toBe(0);
    // PINNED(quirk): Errors added to the builder before the handler threw are committed (the commit runs in a finally block). Decide: should a failed async validation discard partial errors, keep them, or keep the previous result?
    expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["collected before the failure"]));
  });

  it("aborts the running job when the handler is disposed, and discards its result even if the handler ignores the signal", async () => {
    const env = setupAsyncHandler(undefined, -1);
    env.dispose();
    expect(env.runs[0].signal.aborted).toBe(true);
    expect(env.validator.asyncState).toBe(0);
    expect(env.validator.isValidating).toBe(false);
    expect(env.validator.isValid).toBe(true);

    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.isValid).toBe(true);
  });

  it("aborts the running job on reset, and discards its result even if the handler ignores the signal", async () => {
    const env = setupAsyncHandler(undefined, -1);
    env.validator.reset();
    expect(env.runs[0].signal.aborted).toBe(true);
    expect(env.validator.asyncState).toBe(0);
    expect(env.validator.isValid).toBe(true);

    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.isValid).toBe(true);
  });

  it("logs the rejection of a handler that honors the abort signal", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    const dispose = validator.addAsyncHandler(
      () => model.field,
      (_, __, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        })
    );

    dispose();
    await flushMicrotasks();
    // PINNED(quirk): An AbortError from a handler that honors its signal (e.g. fetch(url, { signal })) is reported via console.error like any other failure. Decide: should aborts be swallowed silently?
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toMatchObject({ name: "AbortError" });
    expect(validator.isValid).toBe(true);
  });

  it("does not run a queued job after the handler is disposed", async () => {
    const env = setupAsyncHandler({ initialRun: false });
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(100);
    runInAction(() => {
      env.model.field = -2;
    });
    await vi.advanceTimersByTimeAsync(100);
    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.asyncState).toBe(1); // scheduled
    expect(env.validator.isValid).toBe(false);

    env.dispose();
    expect(env.validator.asyncState).toBe(0);
    expect(env.validator.isValid).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(env.runs).toHaveLength(1);
  });

  describe("with handlers that honor the signal but still report errors when aborted", () => {
    /** Stand-in for fetch(url, { signal }): stays pending and rejects with the AbortError on abort */
    const abortableCall = (signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      });

    const handlers = {
      "adds errors before the call": async (_, b, signal) => {
        b.invalidate("field", "checked before the call");
        await abortableCall(signal);
      },
      "adds errors when the call rejects": async (_, b, signal) => {
        try {
          await abortableCall(signal);
        } catch {
          b.invalidate("field", "could not verify");
        }
      },
    } satisfies Record<string, Validator.AsyncHandler<{ field: number }, number>>;

    it.each([
      { shape: "adds errors before the call", abortBy: "reset" },
      { shape: "adds errors before the call", abortBy: "dispose" },
      { shape: "adds errors when the call rejects", abortBy: "reset" },
      { shape: "adds errors when the call rejects", abortBy: "dispose" },
    ] as const)("discards the result of a handler that $shape when aborted by $abortBy", async ({ shape, abortBy }) => {
      vi.spyOn(console, "error").mockImplementation(() => {}); // A rethrown AbortError is logged
      const model = observable({ field: 0 });
      const validator = Validator.get(model);
      const dispose = validator.addAsyncHandler(() => model.field, handlers[shape]);
      await flushMicrotasks();
      expect(validator.isValidating).toBe(true);

      if (abortBy === "reset") {
        validator.reset();
      } else {
        dispose();
      }
      expect(validator.isValid).toBe(true);

      await flushMicrotasks(); // The aborted call rejects
      expect(validator.isValid).toBe(true);
      expect(validator.isValidating).toBe(false);

      await vi.advanceTimersByTimeAsync(1000);
      expect(validator.isValid).toBe(true);
    });
  });
});

describe("Validator: handler disposal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes the errors of a sync handler and stops reacting", () => {
    const env = setupSyncHandler(undefined, -1);
    expect(env.validator.isValid).toBe(false);

    env.dispose();
    expect(env.validator.isValid).toBe(true);

    runInAction(() => {
      env.model.field = -2;
    });
    expect(env.validator.reactionState).toBe(0);
    vi.advanceTimersByTime(100);
    expect(env.validator.isValid).toBe(true);
    expect(env.seen).toEqual([-1]);
  });

  it("clears a pending reaction", () => {
    const env = setupSyncHandler();
    runInAction(() => {
      env.model.field = -1;
    });
    expect(env.validator.reactionState).toBe(1);

    env.dispose();
    expect(env.validator.reactionState).toBe(0);
    vi.advanceTimersByTime(100);
    expect(env.seen).toEqual([0]);
    expect(env.validator.isValid).toBe(true);
  });

  it("only removes the errors of the disposed handler", () => {
    const model = observable({ field: -1 });
    const validator = Validator.get(model);
    const disposeA = validator.addSyncHandler((b) => {
      if (model.field < 0) b.invalidate("field", "A");
    });
    validator.addSyncHandler((b) => {
      if (model.field < 0) b.invalidate("field", "B");
    });
    validator.updateErrors(Symbol(), (b) => b.invalidate("field", "manual"));
    expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["A", "B", "manual"]));

    disposeA();
    expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["B", "manual"]));
    expect(validator.invalidKeyCount).toBe(1);
  });

  it("can be called more than once", () => {
    const sync = setupSyncHandler(undefined, -1);
    sync.dispose();
    expect(() => sync.dispose()).not.toThrow();
    expect(sync.validator.isValid).toBe(true);

    const async = setupAsyncHandler(undefined, -1);
    async.dispose();
    expect(() => async.dispose()).not.toThrow();
    expect(async.validator.asyncState).toBe(0);
  });
});

describe("Validator: #reset edge cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps errors away until a relevant change even if the handler would still report them", () => {
    const env = setupSyncHandler(undefined, -1);
    expect(env.validator.isValid).toBe(false);

    env.validator.reset();
    expect(env.validator.isValid).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(env.validator.isValid).toBe(true);

    runInAction(() => {
      env.model.field = -2;
    });
    vi.advanceTimersByTime(100);
    expect(env.validator.isValid).toBe(false);
  });

  it("evaluates a pending sync handler immediately and discards its result", () => {
    const env = setupSyncHandler();
    runInAction(() => {
      env.model.field = -1;
    });
    expect(env.validator.reactionState).toBe(1);

    env.validator.reset();
    // reset() deliberately runs the pending reaction (the scheduler's reset callback calls fn(), which MobX
    // needs so that the reaction can be scheduled again), and the effect guard drops the result.
    expect(env.seen).toEqual([0, -1]);
    expect(env.validator.isValid).toBe(true);
    expect(env.validator.reactionState).toBe(0);

    vi.advanceTimersByTime(100);
    expect(env.seen).toEqual([0, -1]);
  });

  it("re-evaluates a sync handler whose scheduled reaction has already run", () => {
    const env = setupSyncHandler();
    runInAction(() => {
      env.model.field = -1;
    });
    vi.advanceTimersByTime(100);
    expect(env.seen).toEqual([0, -1]);

    env.validator.reset();
    // PINNED(quirk): The reset callback stored when a reaction is scheduled is not removed after the scheduled run, so the next reset() re-runs the handler although nothing is pending. Decide: should the callback be dropped once the scheduled reaction has run?
    expect(env.seen).toEqual([0, -1, -1]);

    env.validator.reset();
    expect(env.seen).toEqual([0, -1, -1]);
  });

  it("stays out of the validating state after reset when a request was queued behind the running job", async () => {
    const env = setupAsyncHandler({ initialRun: false });
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(100);
    runInAction(() => {
      env.model.field = -2;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs).toHaveLength(1);

    env.validator.reset();
    expect(env.validator.asyncState).toBe(0);
    expect(env.validator.isValidating).toBe(false);

    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.asyncState).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(100);
    expect(env.validator.asyncState).toBe(0);
    expect(env.runs).toHaveLength(1); // the queued payload was cleared, so the handler is not called
  });

  it("stays out of the validating state after reset when a handler that honors the signal was running with a request queued behind it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {}); // The AbortError is logged
    onTestFinished(() => {
      consoleError.mockRestore();
    });
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    const handler = vi.fn(
      (_: number, __: unknown, signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        })
    );
    validator.addAsyncHandler(() => model.field, handler);
    runInAction(() => {
      model.field = 1;
    });
    await vi.advanceTimersByTimeAsync(100); // queued behind the initial run
    expect(handler).toHaveBeenCalledTimes(1);

    validator.reset();
    expect(validator.isValidating).toBe(false);

    await flushMicrotasks(); // The aborted handler rejects
    expect(validator.isValidating).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(100);
    expect(validator.isValidating).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not carry a request queued before reset over to the job started after it", async () => {
    const env = setupAsyncHandler({ initialRun: false });
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(100);
    runInAction(() => {
      env.model.field = -2;
    });
    await vi.advanceTimersByTimeAsync(100); // queued behind the running job

    env.validator.reset(); // The aborted job never settles
    runInAction(() => {
      env.model.field = -3;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs.map((run) => run.payload)).toEqual([-1, -3]);

    env.runs[1].job.resolve();
    await flushMicrotasks();
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -3"]));
    expect(env.validator.asyncState).toBe(0);
    expect(env.validator.isValidating).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(env.runs).toHaveLength(2);
  });

  it("keeps the job started after reset in charge when the job aborted by reset settles later", async () => {
    const env = setupAsyncHandler(); // The handler ignores its signal
    expect(env.runs.map((run) => run.payload)).toEqual([0]);

    env.validator.reset();
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs.map((run) => run.payload)).toEqual([0, -1]);
    expect(env.validator.isValidating).toBe(true);

    env.runs[0].job.resolve(); // The aborted job settles while the new one is running
    await flushMicrotasks();
    expect(env.validator.asyncState).toBe(1);
    expect(env.validator.isValidating).toBe(true);

    runInAction(() => {
      env.model.field = -2;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs).toHaveLength(2); // queued behind the running job

    env.validator.reset();
    expect(env.runs[1].signal.aborted).toBe(true);
    expect(env.validator.isValidating).toBe(false);
  });

  it("does not reset nested validators", () => {
    class Child {
      @observable field = true;

      constructor() {
        makeObservable(this);
      }
    }
    class Parent {
      @nested child = new Child();
    }
    const parent = new Parent();
    Validator.get(parent.child).updateErrors(Symbol(), (b) => b.invalidate("field", "invalid"));
    const validator = Validator.get(parent);
    expect(validator.isValid).toBe(false);

    validator.reset();
    // PINNED(quirk): reset() only clears the validator's own errors, reactions and jobs; nested validators keep their errors, so the parent stays invalid (unlike Watcher#reset(), which resets nested watchers). Decide: should reset() cascade to nested validators?
    expect(validator.isValid).toBe(false);
    expect(Validator.get(parent.child).isValid).toBe(false);
  });
});

describe("Validator: nested key paths", () => {
  class Leaf {
    @observable field = true;

    constructor() {
      makeObservable(this);
    }
  }

  class Container {
    @nested @observable items = [new Leaf(), new Leaf()];
    @nested @observable maybe: Leaf | null = null;
    @nested @observable map = new Map([["key", new Leaf()]]);
    @nested @observable set = new Set([new Leaf()]);

    constructor() {
      makeObservable(this);
    }
  }

  class HoistedObject {
    @nested.hoist inner = new Leaf();
  }

  class HoistedArray {
    @nested.hoist list = [new Leaf(), new Leaf()];
  }

  const invalidateLeaf = (leaf: Leaf, message: string) =>
    Validator.get(leaf).updateErrors(Symbol(), (b) => b.invalidate("field", message));

  it("exposes nested validators by key path and skips non-object values", () => {
    const container = new Container();
    const validator = Validator.get(container);
    expect([...validator.nested.keys()]).toEqual(["items.0", "items.1", "map.key", "set.0"]);
    expect(validator.nested.get("items.1" as KeyPath)).toBe(Validator.get(container.items[1]));
    expect(validator.nested.get("set.0" as KeyPath)).toBe(Validator.get([...container.set][0]));
  });

  it("builds key paths of array, map and set elements", () => {
    const container = new Container();
    const validator = Validator.get(container);
    invalidateLeaf(container.items[1], "item");
    invalidateLeaf(container.map.get("key")!, "map");
    invalidateLeaf([...container.set][0], "set");

    expect(validator.isValid).toBe(false);
    expect(validator.invalidKeyPaths).toEqual(new Set(["items.1.field", "map.key.field", "set.0.field"]));
    expect(validator.invalidKeyPathCount).toBe(3);
    expect(validator.invalidKeys).toEqual(new Set());
    expect(validator.invalidKeyCount).toBe(0);
    expect(validator.getErrorMessages("map.key.field" as KeyPath)).toEqual(new Set(["map"]));
    expect(validator.getErrorMessages("set.0.field" as KeyPath)).toEqual(new Set(["set"]));
  });

  it("counts a key path reported by both the parent and a nested validator once", () => {
    class Parent {
      @nested child = new Leaf();
    }
    const parent = new Parent();
    const validator = Validator.get(parent);
    validator.updateErrors(Symbol(), (b) => b.invalidate("child", "from parent"));
    Validator.get(parent.child).updateErrors(Symbol(), (b) => b.invalidateSelf("from child"));

    expect(validator.invalidKeyPaths).toEqual(new Set(["child"]));
    expect(validator.invalidKeyPathCount).toBe(1);
    expect(validator.getErrorMessages("child" as KeyPath)).toEqual(new Set(["from parent", "from child"]));
  });

  it("uses a nested error as the first error message when the parent has none", () => {
    const container = new Container();
    invalidateLeaf(container.items[1], "second item");
    expect(Validator.get(container).firstErrorMessage).toBe("second item");
  });

  it("updates reactively when nested objects are added, replaced or removed", () => {
    const container = new Container();
    const validator = Validator.get(container);
    const invalid = new Leaf();
    invalidateLeaf(invalid, "invalid");

    const observed: number[] = [];
    const dispose = autorun(() => {
      observed.push(validator.invalidKeyPathCount);
    });
    runInAction(() => {
      container.maybe = invalid;
    });
    runInAction(() => {
      container.items.push(invalid);
    });
    runInAction(() => {
      container.maybe = null;
    });
    runInAction(() => {
      container.items.splice(2, 1);
    });
    dispose();

    expect(observed).toEqual([0, 1, 2, 1, 0]);
  });

  it("finds errors of a specific array element with an exact search", () => {
    const container = new Container();
    const validator = Validator.get(container);
    invalidateLeaf(container.items[0], "first item");
    invalidateLeaf(container.items[1], "second item");

    expect(listErrors(validator.findErrors("items.1" as KeyPath))).toEqual([["items.1.field", "second item"]]);
    expect(listErrors(validator.findErrors("items.1.field" as KeyPath))).toEqual([["items.1.field", "second item"]]);
  });

  it("stops at the first array element with a prefix search on the array", () => {
    const container = new Container();
    const validator = Validator.get(container);
    invalidateLeaf(container.items[0], "first item");
    invalidateLeaf(container.items[1], "second item");

    // PINNED(bug): #findErrors breaks out of the ancestor loop after the first element of "items", so the errors of items.1 are missing. Expected: [["items.0.field", "first item"], ["items.1.field", "second item"]] ("Includes errors from nested validators when using prefix match"). Flip this assertion when fixing.
    expect(listErrors(validator.findErrors("items" as KeyPath, true))).toEqual([["items.0.field", "first item"]]);
  });

  it("misses an invalid later array element in prefix-matched hasErrors/getErrorMessages", () => {
    const container = new Container();
    const validator = Validator.get(container);
    invalidateLeaf(container.items[1], "second item");
    expect(validator.invalidKeyPaths).toEqual(new Set(["items.1.field"]));

    // PINNED(bug): Only the first element under "items" is searched with prefixMatch, so an error on items.1 is not found. Expected: hasErrors("items", true) is true and getErrorMessages("items", true) is Set(["second item"]). Flip these assertions when fixing.
    expect(validator.hasErrors("items" as KeyPath, true)).toBe(false);
    expect(validator.getErrorMessages("items" as KeyPath, true)).toEqual(new Set());
  });

  it("returns the errors of the first element when prefix-searching another element", () => {
    const container = new Container();
    const validator = Validator.get(container);
    invalidateLeaf(container.items[0], "first item");
    invalidateLeaf(container.items[1], "second item");

    // PINNED(bug): With prefixMatch, the relative path of every element under an array key is replaced by KeyPath.Self, so searching "items.1" yields the errors of items.0. Expected: [["items.1.field", "second item"]]. Flip this assertion when fixing.
    expect(listErrors(validator.findErrors("items.1" as KeyPath, true))).toEqual([["items.0.field", "first item"]]);
  });

  it("returns every error of an array element when prefix-searching a key path below it", () => {
    class Row {
      @observable field = 0;
      @observable other = 0;

      constructor() {
        makeObservable(this);
      }
    }
    class Table {
      @nested @observable rows = [new Row()];

      constructor() {
        makeObservable(this);
      }
    }
    const table = new Table();
    const validator = Validator.get(table);
    Validator.get(table.rows[0]).updateErrors(Symbol(), (b) => b.invalidate("other", "other"));

    expect(validator.hasErrors("rows.0.field" as KeyPath)).toBe(false);
    expect(listErrors(validator.findErrors("rows.0" as KeyPath, true))).toEqual([["rows.0.other", "other"]]);
    // PINNED(bug): With prefixMatch, the path below an array element is replaced by KeyPath.Self, so searching "rows.0.field" yields the errors of "rows.0.other" too. Expected: findErrors("rows.0.field", true) is empty and hasErrors("rows.0.field", true) is false. Flip these assertions when fixing.
    expect(listErrors(validator.findErrors("rows.0.field" as KeyPath, true))).toEqual([["rows.0.other", "other"]]);
    expect(validator.hasErrors("rows.0.field" as KeyPath, true)).toBe(true);
  });

  it("includes errors of a hoisted object in findErrors(Self) but not in lookups by key path", () => {
    const hoisted = new HoistedObject();
    const validator = Validator.get(hoisted);
    invalidateLeaf(hoisted.inner, "hoisted");

    expect(listErrors(validator.findErrors(KeyPath.Self))).toEqual([["field", "hoisted"]]);
    expect(validator.invalidKeyPaths).toEqual(new Set(["field"]));
    expect(validator.firstErrorMessage).toBe("hoisted");
    // PINNED(quirk): invalidKeys/invalidKeyCount ignore hoisted errors although hoisted objects are "treated as part of the parent object". Decide: should hoisted keys count as the parent's own keys?
    expect(validator.invalidKeys).toEqual(new Set());
    expect(validator.invalidKeyCount).toBe(0);
    // PINNED(bug): Lookups by key path only consult fetchers for the ancestors of the searched path and never the hoisted (KeyPath.Self) one, so "field" of the hoisted object is not found although invalidKeyPaths lists it. Expected: hasErrors("field") is true and getErrorMessages("field") is Set(["hoisted"]) ("Changes and errors from nested objects appear on the parent"). Flip these assertions when fixing.
    expect(validator.hasErrors("field" as KeyPath)).toBe(false);
    expect(validator.hasErrors("field" as KeyPath, true)).toBe(false);
    expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set());
  });

  it("includes errors of hoisted array elements only in a prefix search from Self", () => {
    const hoisted = new HoistedArray();
    const validator = Validator.get(hoisted);
    invalidateLeaf(hoisted.list[1], "second");

    expect(validator.invalidKeyPaths).toEqual(new Set(["1.field"]));
    expect(listErrors(validator.findErrors(KeyPath.Self, true))).toEqual([["1.field", "second"]]);
    expect(listErrors(validator.findErrors(KeyPath.Self))).toEqual([]); // only self errors of hoisted elements
    // PINNED(bug): Same as for hoisted objects: key path lookups never consult the hoisted fetcher, so "1.field" and the prefix "1" are not found. Expected: [["1.field", "second"]] and hasErrors("1", true) === true. Flip these assertions when fixing.
    expect(listErrors(validator.findErrors("1.field" as KeyPath))).toEqual([]);
    expect(validator.hasErrors("1" as KeyPath, true)).toBe(false);
  });

  it("reports isValidating while a reaction of a nested validator is pending", () => {
    vi.useFakeTimers();
    try {
      class ValidatedLeaf {
        @observable field = true;

        constructor() {
          makeObservable(this);
          makeValidatable(this, (b) => {
            if (!this.field) b.invalidate("field", "invalid");
          });
        }
      }
      class Holder {
        @nested @observable child = new ValidatedLeaf();

        constructor() {
          makeObservable(this);
        }
      }
      const holder = new Holder();
      const validator = Validator.get(holder);

      runInAction(() => {
        holder.child.field = false;
      });
      expect(validator.reactionState).toBe(0);
      expect(validator.isValidating).toBe(true);
      expect(validator.isValid).toBe(true);

      vi.advanceTimersByTime(100);
      expect(validator.isValidating).toBe(false);
      expect(validator.invalidKeyPaths).toEqual(new Set(["child.field"]));
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws a MobX cycle error when nested objects reference each other", () => {
    class LinkedNode {
      @nested @observable next: LinkedNode | null = null;

      constructor() {
        makeObservable(this);
      }
    }
    const a = new LinkedNode();
    const b = new LinkedNode();
    runInAction(() => {
      a.next = b;
      b.next = a;
    });

    // PINNED(quirk): Cyclic @nested graphs are unsupported: the aggregating computeds recurse into themselves and MobX throws "Cycle detected in computation". Decide: should cycles be detected and skipped (e.g. by tracking visited validators)?
    expect(() => Validator.get(a).isValid).toThrow(mobxCycleError);
    expect(() => Validator.get(a).isValidating).toThrow(mobxCycleError);
  });
});

describe("Validator: types", () => {
  it("types the accessors", () => {
    const target = { field: 0 };
    expectTypeOf(Validator.get(target)).toEqualTypeOf<Validator<{ field: number }>>();
    expectTypeOf(Validator.getSafe(target)).toEqualTypeOf<Validator<{ field: number }> | null>();
    expectTypeOf(Validator.getSafe(1)).toEqualTypeOf<Validator<number> | null>();
    // @ts-expect-error primitives are rejected by get()
    expect(() => Validator.get(1)).toThrow(TypeError);
    // @ts-expect-error the constructor is private
    expect(() => new Validator()).toThrow("private constructor");
    expectTypeOf(Validator.defaultDelayMs).toEqualTypeOf<number>();
  });

  it("types the handler registration APIs", () => {
    const model = observable({ field: 0, name: "" });
    const validator = Validator.get(model);
    const disposers: Array<() => void> = [];

    const disposeSync = validator.addSyncHandler((b) => {
      expectTypeOf(b).toEqualTypeOf<ValidationErrorMapBuilder<typeof model>>();
      b.invalidate("field", "ok");
      // @ts-expect-error unknown keys are rejected
      b.invalidate("unknown", "ng");
    });
    expectTypeOf(disposeSync).toEqualTypeOf<() => void>();
    disposers.push(disposeSync);

    const disposeAsync = validator.addAsyncHandler(
      () => model.name,
      async (name, b, signal) => {
        expectTypeOf(name).toEqualTypeOf<string>();
        expectTypeOf(b).toEqualTypeOf<ValidationErrorMapBuilder<typeof model>>();
        expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
      },
      {
        equals: (a, b) => {
          expectTypeOf(a).toEqualTypeOf<string>();
          return a === b;
        },
      }
    );
    expectTypeOf(disposeAsync).toEqualTypeOf<() => void>();
    disposers.push(disposeAsync);

    disposers.push(
      validator.addAsyncHandler(
        () => model.name,
        // @ts-expect-error the handler cannot change the type inferred from the expression
        async (_name: number) => {}
      )
    );

    const disposeMakeSync = makeValidatable(model, () => {});
    expectTypeOf(disposeMakeSync).toEqualTypeOf<() => void>();
    disposers.push(disposeMakeSync);

    const disposeMakeAsync = makeValidatable(
      model,
      () => model.field,
      async (field) => {
        expectTypeOf(field).toEqualTypeOf<number>();
      }
    );
    expectTypeOf(disposeMakeAsync).toEqualTypeOf<() => void>();
    disposers.push(disposeMakeAsync);

    expectTypeOf(validator.updateErrors(Symbol(), () => {})).toEqualTypeOf<() => void>();
    expectTypeOf<Validator.HandlerOptions<string>>().toEqualTypeOf<{
      initialRun?: boolean;
      delayMs?: number;
      equals?: IEqualsComparer<string>;
    }>();

    for (const dispose of disposers) dispose();
  });

  it("types the query APIs", () => {
    const validator = Validator.get({ field: 0 });
    expectTypeOf(validator.id).toEqualTypeOf<string>();
    expectTypeOf(validator.isValid).toEqualTypeOf<boolean>();
    expectTypeOf(validator.isValidating).toEqualTypeOf<boolean>();
    expectTypeOf(validator.waitForValidation).parameters.toEqualTypeOf<[opt?: { signal?: AbortSignal }]>();
    expectTypeOf(validator.waitForValidation).returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf(validator.reactionState).toEqualTypeOf<number>();
    expectTypeOf(validator.asyncState).toEqualTypeOf<number>();
    expectTypeOf(validator.invalidKeys).toEqualTypeOf<ReadonlySet<KeyPath>>();
    expectTypeOf(validator.invalidKeyPaths).toEqualTypeOf<ReadonlySet<KeyPath>>();
    expectTypeOf(validator.invalidKeyCount).toEqualTypeOf<number>();
    expectTypeOf(validator.invalidKeyPathCount).toEqualTypeOf<number>();
    expectTypeOf(validator.nested).toEqualTypeOf<ReadonlyMap<KeyPath, Validator<any>>>();
    expectTypeOf(validator.getErrorMessages(KeyPath.Self)).toEqualTypeOf<Set<string>>();
    expectTypeOf(validator.hasErrors(KeyPath.Self)).toEqualTypeOf<boolean>();
    expectTypeOf(validator.findErrors(KeyPath.Self)).toMatchTypeOf<Iterable<[KeyPath, ValidationError]>>();
    // `null` is intended (see "#firstErrorMessage returns null when there are no errors"); the "string | undefined" in the docs is outdated.
    expectTypeOf(validator.firstErrorMessage).toEqualTypeOf<string | null>();
    expect(validator.firstErrorMessage).toBeNull();
  });

  it("types the makeValidatable overloads and handler signatures", () => {
    const model = observable({ field: 0, name: "" });
    const disposers: Array<() => void> = [];

    // @ts-expect-error primitives are rejected as the target
    expect(() => makeValidatable(1, () => {})).toThrow(TypeError);

    disposers.push(
      makeValidatable(model, (b) => {
        expectTypeOf(b).toEqualTypeOf<ValidationErrorMapBuilder<typeof model>>();
        // @ts-expect-error unknown keys are rejected
        b.invalidate("unknown", "ng");
      })
    );
    disposers.push(
      makeValidatable(
        model,
        () => model.name,
        async (name, b, signal) => {
          expectTypeOf(name).toEqualTypeOf<string>();
          expectTypeOf(b).toEqualTypeOf<ValidationErrorMapBuilder<typeof model>>();
          expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
        },
        { delayMs: 10, equals: (a, b) => a === b }
      )
    );
    disposers.push(
      Validator.get(model).addAsyncHandler(
        () => model.name,
        // @ts-expect-error async handlers must return a promise
        () => {}
      )
    );

    expectTypeOf<Validator.SyncHandler<typeof model>>().toEqualTypeOf<
      (builder: ValidationErrorMapBuilder<typeof model>) => void
    >();
    expectTypeOf<Validator.InstantHandler<typeof model>>().toEqualTypeOf<Validator.SyncHandler<typeof model>>();
    expectTypeOf<Validator.AsyncHandler<typeof model, string>>().toEqualTypeOf<
      (expr: string, builder: ValidationErrorMapBuilder<typeof model>, abortSignal: AbortSignal) => Promise<void>
    >();
    Validator.get(model).updateErrors(Symbol(), (b) => {
      expectTypeOf(b).toEqualTypeOf<ValidationErrorMapBuilder<typeof model>>();
    });

    for (const dispose of disposers) dispose();
  });
});

describe("Validator: key names containing dots", () => {
  it("treats the part before the first dot as the key of an error", () => {
    const target = { a: 0, "a.b": 0 };
    const validator = Validator.get(target);
    validator.updateErrors(Symbol(), (b) => {
      b.invalidate("a.b", "dotted");
    });

    expect(validator.invalidKeyPaths).toEqual(new Set(["a.b"]));
    // PINNED(quirk): invalidate() does not escape dots, so a property named "a.b" is recorded as the nested key path a.b: invalidKeys reports "a" (which has no error of its own) and an exact lookup of "a" finds nothing while a prefix lookup does. Decide: should dotted property names be escaped or rejected, so that invalidKeys reports "a.b"?
    expect(validator.invalidKeys).toEqual(new Set(["a"]));
    expect(validator.hasErrors("a" as KeyPath)).toBe(false);
    expect(listErrors(validator.findErrors("a" as KeyPath, true))).toEqual([["a.b", "dotted"]]);
    expect(listErrors(validator.findErrors("a.b" as KeyPath))).toEqual([["a.b", "dotted"]]);

    validator.updateErrors(Symbol(), (b) => {
      b.invalidate("a", "plain");
    });
    expect(validator.invalidKeyCount).toBe(1);
    expect(validator.invalidKeyPathCount).toBe(2);
  });

  it("reports the full key path of a dotted key found through a nested validator", () => {
    class Leaf {
      "x.y" = 0;
    }
    class Parent {
      @nested child = new Leaf();
    }
    const parent = new Parent();
    Validator.get(parent.child).updateErrors(Symbol(), (b) => b.invalidate("x.y", "deep"));
    const validator = Validator.get(parent);

    expect(validator.invalidKeyPaths).toEqual(new Set(["child.x.y"]));
    expect(listErrors(validator.findErrors("child.x" as KeyPath, true))).toEqual([["child.x.y", "deep"]]);
    expect(listErrors(validator.findErrors("child" as KeyPath))).toEqual([["child.x.y", "deep"]]);
    expect(listErrors(validator.findErrors("child.x" as KeyPath))).toEqual([]);
  });
});

describe("Validator: change notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not notify observers of invalidKeyPaths when only the messages of own or nested errors change", () => {
    class Leaf {
      @observable field = 0;

      constructor() {
        makeObservable(this);
      }
    }
    class Parent {
      @nested child = new Leaf();
    }
    const parent = new Parent();
    const validator = Validator.get(parent);
    const childValidator = Validator.get(parent.child);
    const key = Symbol();
    validator.updateErrors(key, (b) => b.invalidate("child", "parent 1"));
    childValidator.updateErrors(key, (b) => b.invalidate("field", "child 1"));

    const observer = vi.fn();
    const dispose = autorun(() => observer(validator.invalidKeyPaths));
    validator.updateErrors(key, (b) => b.invalidate("child", "parent 2"));
    childValidator.updateErrors(key, (b) => b.invalidate("field", "child 2"));
    expect(observer).toHaveBeenCalledTimes(1);

    childValidator.updateErrors(key, () => {});
    expect(observer).toHaveBeenCalledTimes(2);
    expect(observer).toHaveBeenLastCalledWith(new Set(["child"]));
    dispose();
  });

  it("notifies observers once for all the state changes made by reset()", () => {
    const env = setupSyncHandler(undefined, -1);
    const observed: Array<[boolean, number]> = [];
    const dispose = autorun(() => {
      observed.push([env.validator.isValid, env.validator.reactionState]);
    });
    runInAction(() => {
      env.model.field = -2;
    });
    expect(observed).toEqual([
      [false, 0],
      [false, 1],
    ]);

    env.validator.reset();
    expect(observed).toEqual([
      [false, 0],
      [false, 1],
      [true, 0],
    ]);
    dispose();
  });

  it("notifies observers once for all the state changes made by a handler disposer", () => {
    const env = setupSyncHandler(undefined, -1);
    const observed: Array<[boolean, number]> = [];
    const dispose = autorun(() => {
      observed.push([env.validator.isValid, env.validator.reactionState]);
    });
    runInAction(() => {
      env.model.field = -2;
    });

    env.dispose();
    expect(observed).toEqual([
      [false, 0],
      [false, 1],
      [true, 0],
    ]);
    dispose();
  });
});

describe("Validator: timers and pending reactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the reaction timer when the handler is disposed or the validator is reset", () => {
    const disposed = setupSyncHandler();
    runInAction(() => {
      disposed.model.field = -1;
    });
    expect(vi.getTimerCount()).toBe(1);
    disposed.dispose();
    expect(vi.getTimerCount()).toBe(0);

    const reset = setupSyncHandler();
    runInAction(() => {
      reset.model.field = -1;
    });
    expect(vi.getTimerCount()).toBe(1);
    reset.validator.reset();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { name: "after the initial run", opt: undefined, initialRuns: 1 },
    { name: "when initialRun is false", opt: { initialRun: false }, initialRuns: 0 },
  ])("does not start an async job for a reaction pending at reset() ($name)", async ({ opt, initialRuns }) => {
    const env = setupAsyncHandler(opt);
    for (const run of env.runs) run.job.resolve();
    await flushMicrotasks();

    runInAction(() => {
      env.model.field = -1;
    });
    expect(env.validator.reactionState).toBe(1);

    env.validator.reset();
    expect(env.runs).toHaveLength(initialRuns);
    expect(env.validator.asyncState).toBe(0);
    expect(env.validator.isValidating).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(env.runs).toHaveLength(initialRuns);
    expect(env.validator.isValid).toBe(true);
  });

  it("leaves the validating state when an async expression returns to its previous value before the delay elapses", async () => {
    const env = setupAsyncHandler({ initialRun: false });
    runInAction(() => {
      env.model.field = -1;
    });
    runInAction(() => {
      env.model.field = 0;
    });
    expect(env.validator.reactionState).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(env.validator.reactionState).toBe(0);
    expect(env.validator.isValidating).toBe(false);

    // A later change of the value is still validated
    runInAction(() => {
      env.model.field = -2;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs.map((run) => run.payload)).toEqual([-2]);
    expect(env.validator.reactionState).toBe(0);
  });

  it("leaves the validating state when a derived async expression does not change", async () => {
    const model = observable({ field: 1 });
    const validator = Validator.get(model);
    const handler = vi.fn(async () => {});
    validator.addAsyncHandler(() => model.field > 0, handler);
    await flushMicrotasks();
    expect(validator.isValidating).toBe(false);

    runInAction(() => {
      model.field = 2;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(validator.reactionState).toBe(0);
    expect(validator.isValidating).toBe(false);

    // A change of the derived value is still validated
    runInAction(() => {
      model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(validator.reactionState).toBe(0);
  });

  it("keeps the next run pending when applying the errors of a run schedules it", () => {
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    validator.addSyncHandler((b) => {
      // Reads the validity that applying its own errors changes
      if (model.field < 0) b.invalidate("field", validator.isValid ? "first run" : "second run");
    });

    runInAction(() => {
      model.field = -1;
    });
    vi.advanceTimersByTime(100);
    expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["first run"]));
    expect(vi.getTimerCount()).toBe(1);
    expect(validator.reactionState).toBe(1);

    vi.advanceTimersByTime(100);
    expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["second run"]));
    expect(vi.getTimerCount()).toBe(0);
    expect(validator.reactionState).toBe(0);
  });
});

describe("Validator: async job lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("honors the delayMs option for the follow-up job queued behind a running job", async () => {
    const env = setupAsyncHandler({ initialRun: false, delayMs: 30 });
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(30);
    runInAction(() => {
      env.model.field = -2;
    });
    await vi.advanceTimersByTimeAsync(30);
    expect(env.runs).toHaveLength(1);

    env.runs[0].job.resolve();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(29);
    expect(env.runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(env.runs.map((run) => run.payload)).toEqual([-1, -2]);
  });

  it("validates the latest value when it changes more than once while the follow-up job is scheduled", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    onTestFinished(() => {
      consoleError.mockRestore();
    });
    const model = observable({ name: "" });
    const runs: Array<{ name: string; signal: AbortSignal }> = [];
    makeValidatable(
      model,
      () => model.name,
      (name, b, signal) =>
        new Promise<void>((resolve, reject) => {
          runs.push({ name, signal });
          const timerId = setTimeout(() => {
            if (name === "taken") b.invalidate("name", "already taken");
            resolve();
          }, 10);
          signal.addEventListener("abort", () => {
            clearTimeout(timerId);
            reject(signal.reason);
          });
        }),
      // With fake timers, a 0ms timer created inside a timer callback is due 1ms later, while the reaction
      // timers created below are due immediately, so each change reaches the job while it is scheduled
      { delayMs: 0 }
    );
    const validator = Validator.get(model);

    await vi.advanceTimersByTimeAsync(5);
    runInAction(() => {
      model.name = "a"; // queued behind the initial run
    });
    await vi.advanceTimersByTimeAsync(5); // t=10: the initial run settles and the follow-up job is scheduled
    runInAction(() => {
      model.name = "tak";
    });
    await vi.advanceTimersByTimeAsync(0);
    runInAction(() => {
      model.name = "taken";
    });
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(1); // t=11: the follow-up job starts
    expect(runs.map((run) => run.name)).toEqual(["", "taken"]);
    expect(runs[1].signal.aborted).toBe(false);
    expect(validator.isValidating).toBe(true);

    await vi.advanceTimersByTimeAsync(10); // t=21
    expect(validator.isValidating).toBe(false);
    expect(validator.getErrorMessages("name" as KeyPath)).toEqual(new Set(["already taken"]));
    expect(consoleError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not count or run the job of a handler disposed while a follow-up job was queued behind the running one", async () => {
    const env = setupAsyncHandler({ initialRun: false });
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(100);
    runInAction(() => {
      env.model.field = -2;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs).toHaveLength(1);
    expect(env.validator.asyncState).toBe(1);

    env.dispose();
    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.asyncState).toBe(0);
    expect(env.validator.isValidating).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(env.runs).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("goes through create, change, reset, change and dispose with sync and async handlers on the same validator", async () => {
    const env = setupAsyncHandler(undefined, -1);
    const disposeSync = env.validator.addSyncHandler((b) => {
      if (env.model.field < 0) b.invalidate("field", `sync: ${env.model.field}`);
    });

    // create: the sync handler reports immediately, the async job is running
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["sync: -1"]));
    expect(env.validator.asyncState).toBe(1);
    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["sync: -1", "negative: -1"]));
    expect(env.validator.isValidating).toBe(false);

    // change
    runInAction(() => {
      env.model.field = -2;
    });
    expect(env.validator.reactionState).toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(env.validator.reactionState).toBe(0);
    expect(env.validator.asyncState).toBe(1);
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -1", "sync: -2"]));

    // reset: everything is cleared and the running job is aborted
    env.validator.reset();
    expect(env.runs[1].signal.aborted).toBe(true);
    expect(env.validator.isValid).toBe(true);
    expect(env.validator.isValidating).toBe(false);

    // change: both handlers resume
    runInAction(() => {
      env.model.field = -3;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs.map((run) => run.payload)).toEqual([-1, -2, -3]);
    expect(env.runs[2].signal.aborted).toBe(false);
    env.runs[2].job.resolve();
    await flushMicrotasks();
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["sync: -3", "negative: -3"]));
    expect(env.validator.isValidating).toBe(false);

    // dispose: errors are removed and further changes are ignored
    env.dispose();
    disposeSync();
    expect(env.validator.isValid).toBe(true);
    runInAction(() => {
      env.model.field = -4;
    });
    expect(env.validator.reactionState).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(env.runs).toHaveLength(3);
    expect(env.validator.isValid).toBe(true);
    expect(env.validator.isValidating).toBe(false);
  });
});

describe("Validator: #waitForValidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Whether anything observes validator.isValidating, such as a pending wait */
  const isValidatingObserved = (validator: Validator<any>) => !!getObserverTree(validator, "isValidating").observers;

  /** Follow the outcome of a promise without awaiting it */
  function track(promise: Promise<void>) {
    const outcome: { status: "pending" | "resolved" | "rejected"; reason?: unknown } = { status: "pending" };
    promise.then(
      () => {
        outcome.status = "resolved";
      },
      (reason) => {
        outcome.status = "rejected";
        outcome.reason = reason;
      }
    );
    return outcome;
  }

  it("resolves right away when nothing is being validated", async () => {
    const { validator } = setupSyncHandler();
    expect(validator.isValidating).toBe(false);

    const wait = track(validator.waitForValidation());
    await flushMicrotasks();
    expect(wait.status).toBe("resolved");
    expect(isValidatingObserved(validator)).toBe(false);
  });

  it("waits for a scheduled sync validation and resolves once its errors are applied", async () => {
    const { model, validator } = setupSyncHandler();
    runInAction(() => {
      model.field = -1;
    });

    let errorsOnResolve: Set<string> | undefined;
    const wait = track(
      validator.waitForValidation().then(() => {
        errorsOnResolve = validator.getErrorMessages("field" as KeyPath);
      })
    );
    expect(isValidatingObserved(validator)).toBe(true);

    await vi.advanceTimersByTimeAsync(99);
    expect(wait.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.status).toBe("resolved");
    expect(errorsOnResolve).toEqual(new Set(["negative: -1"]));
    expect(isValidatingObserved(validator)).toBe(false);
  });

  it("resolves once a scheduled sync validation has run, even if the handler throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    onTestFinished(() => {
      consoleError.mockRestore();
    });
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    const failure = new Error("handler failure");
    validator.addSyncHandler(() => {
      if (model.field === 1) throw failure;
    });
    runInAction(() => {
      model.field = 1;
    });

    const wait = track(validator.waitForValidation());
    await vi.advanceTimersByTimeAsync(99);
    expect(wait.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(consoleError.mock.calls.some((args) => args.includes(failure))).toBe(true);
    expect(wait.status).toBe("resolved");
    expect(isValidatingObserved(validator)).toBe(false);
  });

  it("waits for a running async validation and the follow-up job queued behind it", async () => {
    const env = setupAsyncHandler({ initialRun: false });
    runInAction(() => {
      env.model.field = -1;
    });
    const wait = track(env.validator.waitForValidation());

    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs).toHaveLength(1);
    runInAction(() => {
      env.model.field = -2; // Queued behind the running job
    });
    await vi.advanceTimersByTimeAsync(100);

    env.runs[0].job.resolve();
    await flushMicrotasks();
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -1"]));
    expect(wait.status).toBe("pending");

    await vi.advanceTimersByTimeAsync(100);
    expect(env.runs.map((run) => run.payload)).toEqual([-1, -2]);
    expect(wait.status).toBe("pending");

    env.runs[1].job.resolve();
    await flushMicrotasks();
    expect(wait.status).toBe("resolved");
    expect(env.validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -2"]));
  });

  it.each([
    { name: "returns to its previous value before the delay elapses", expr: (field: number) => field, values: [-1, 0] },
    { name: "is derived and does not change", expr: (field: number) => field >= 0, values: [1] },
  ])("resolves when the expression of a scheduled async validation $name", async ({ expr, values }) => {
    const model = observable({ field: 0 });
    const validator = Validator.get(model);
    const handler = vi.fn(async () => {});
    validator.addAsyncHandler(() => expr(model.field), handler, { initialRun: false });
    for (const value of values) {
      runInAction(() => {
        model.field = value;
      });
    }

    const wait = track(validator.waitForValidation());
    await vi.advanceTimersByTimeAsync(99);
    expect(wait.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(handler).not.toHaveBeenCalled();
    expect(wait.status).toBe("resolved");
    expect(isValidatingObserved(validator)).toBe(false);
  });

  it("waits for nested validators", async () => {
    class Leaf {
      @observable field = 0;

      constructor() {
        makeObservable(this);
        makeValidatable(this, (b) => {
          if (this.field < 0) b.invalidate("field", "negative");
        });
      }
    }
    class Root {
      @nested @observable leaf = new Leaf();

      constructor() {
        makeObservable(this);
      }
    }
    const root = new Root();
    const validator = Validator.get(root);

    runInAction(() => {
      root.leaf.field = -1;
    });
    expect(validator.reactionState).toBe(0); // Only the nested validator has a pending reaction
    const wait = track(validator.waitForValidation());

    await vi.advanceTimersByTimeAsync(99);
    expect(wait.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.status).toBe("resolved");
    expect(validator.invalidKeyPaths).toEqual(new Set(["leaf.field"]));
  });

  it.each([
    { name: "reset()", cancel: (env: ReturnType<typeof setupAsyncHandler>) => env.validator.reset() },
    { name: "removing the handler", cancel: (env: ReturnType<typeof setupAsyncHandler>) => env.dispose() },
  ])("resolves when $name cancels the validation", async ({ cancel }) => {
    const env = setupAsyncHandler({ initialRun: false });
    runInAction(() => {
      env.model.field = -1;
    });
    await vi.advanceTimersByTimeAsync(100);
    runInAction(() => {
      env.model.field = -2; // Pending reaction on top of the running job
    });
    expect(env.validator.reactionState).toBe(1);
    expect(env.validator.asyncState).toBe(1);

    const wait = track(env.validator.waitForValidation());
    await flushMicrotasks();
    expect(wait.status).toBe("pending");

    cancel(env);
    await flushMicrotasks();
    expect(wait.status).toBe("resolved");
    expect(env.validator.isValid).toBe(true);
  });

  describe("with a signal", () => {
    it("rejects with the reason of the signal when it is aborted while waiting, and stops observing", async () => {
      const { model, validator } = setupSyncHandler();
      runInAction(() => {
        model.field = -1;
      });
      const controller = new AbortController();
      const wait = track(validator.waitForValidation({ signal: controller.signal }));
      await flushMicrotasks();
      expect(wait.status).toBe("pending");

      const reason = new Error("stop waiting");
      controller.abort(reason);
      await flushMicrotasks();
      expect(wait.status).toBe("rejected");
      expect(wait.reason).toBe(reason);
      expect(isValidatingObserved(validator)).toBe(false);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);

      // Only the wait is aborted, not the validation
      await vi.advanceTimersByTimeAsync(100);
      expect(validator.getErrorMessages("field" as KeyPath)).toEqual(new Set(["negative: -1"]));
    });

    it("rejects with the reason of a signal aborted beforehand, even if nothing is being validated", async () => {
      const { validator } = setupSyncHandler();
      const controller = new AbortController();
      controller.abort();

      await expect(validator.waitForValidation({ signal: controller.signal })).rejects.toBe(controller.signal.reason);
      expect(isValidatingObserved(validator)).toBe(false);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    });

    it("resolves and removes its listener from the signal once the validation completes", async () => {
      const { model, validator } = setupSyncHandler();
      runInAction(() => {
        model.field = -1;
      });
      const controller = new AbortController();
      const wait = track(validator.waitForValidation({ signal: controller.signal }));
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(wait.status).toBe("resolved");
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);

      controller.abort();
      await flushMicrotasks();
      expect(wait.status).toBe("resolved");
    });

    it("removes its listener from the signal when it resolves right away", async () => {
      const { validator } = setupSyncHandler();
      const controller = new AbortController();

      await expect(validator.waitForValidation({ signal: controller.signal })).resolves.toBeUndefined();
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    });
  });

  it("rejects with the error isValidating throws, and stops observing", async () => {
    class LinkedNode {
      @nested @observable next: LinkedNode | null = null;

      constructor() {
        makeObservable(this);
      }
    }
    const a = new LinkedNode();
    const b = new LinkedNode();
    runInAction(() => {
      a.next = b;
      b.next = a;
    });
    const validator = Validator.get(a);
    const controller = new AbortController();

    await expect(validator.waitForValidation({ signal: controller.signal })).rejects.toThrow(mobxCycleError);
    expect(isValidatingObserved(validator)).toBe(false);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
});
