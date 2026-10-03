import { computed, getObserverTree, makeObservable, observable, runInAction } from "mobx";
import type { ValidationErrorMapBuilder } from "./error";
import { nested } from "./nested";
import { addValidation, Validator } from "./validator";
import { Watcher, watch } from "./watcher";

/**
 * Whether the object behind the reference gets garbage collected
 *
 * Create the object in a function of its own that returns only the reference: a local variable of the test, or of a
 * scope shared with a closure that is still alive, would keep it alive. `new WeakRef()` and `WeakRef#deref()` hold
 * their target until the current job ends, so each attempt waits for a new task before collecting.
 *
 * @returns `false` if the object is still reachable after a few attempts
 */
async function isCollected(ref: WeakRef<object>) {
  const { gc } = globalThis;
  if (!gc) throw new Error("gc() is not exposed: run Vitest with `execArgv: ['--expose-gc']`");
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    if (!ref.deref()) return true;
  }
  return false;
}

/** A minimal model to be nested */
class Leaf {
  @observable value = 0;

  constructor() {
    makeObservable(this);
  }
}

describe("Watcher", () => {
  class Sample {
    @observable field = 0;
    @nested @observable leaf = new Leaf();
    @nested @observable leaves = [new Leaf()];

    constructor() {
      makeObservable(this);
    }
  }

  it("is garbage collected together with its target and the nested objects", async () => {
    const refs = (() => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      runInAction(() => {
        sample.field++;
        sample.leaf.value++;
        sample.leaves.push(new Leaf());
      });
      expect(watcher.changed).toBe(true);
      return {
        sample: new WeakRef(sample),
        watcher: new WeakRef(watcher),
        leaf: new WeakRef(sample.leaf),
        leafWatcher: new WeakRef(Watcher.get(sample.leaf)),
      };
    })();
    expect(await isCollected(refs.sample)).toBe(true);
    expect(await isCollected(refs.watcher)).toBe(true);
    expect(await isCollected(refs.leaf)).toBe(true);
    expect(await isCollected(refs.leafWatcher)).toBe(true);
  });

  it("is garbage collected in a reference cycle with a nested object", async () => {
    class Child {
      @observable value = 0;

      constructor(readonly parent: object) {
        makeObservable(this);
      }
    }

    class Owner {
      @nested @observable child = new Child(this);

      constructor() {
        makeObservable(this);
      }
    }

    const ref = (() => {
      const owner = new Owner();
      Watcher.get(owner);
      return new WeakRef(owner);
    })();
    expect(await isCollected(ref)).toBe(true);
  });

  it("releases a nested object once it is removed from the target", async () => {
    const sample = new Sample();
    const watcher = Watcher.get(sample);
    const refs = (() => ({ leaf: new WeakRef(sample.leaf), element: new WeakRef(sample.leaves[0]) }))();
    runInAction(() => {
      sample.leaf = new Leaf();
      sample.leaves.splice(0);
    });
    // Before mobxjs/mobx#3812 (e.g. in MobX 6.11), a reaction keeps the previous value of its expression until it runs
    // again, so change the properties once more
    runInAction(() => {
      sample.leaf = new Leaf();
      sample.leaves.push(new Leaf());
    });
    expect(await isCollected(refs.leaf)).toBe(true);
    expect(await isCollected(refs.element)).toBe(true);
    expect(watcher.changedKeyPaths).toEqual(new Set(["leaf", "leaves"]));
  });

  describe("when the target observes an object that outlives it", () => {
    class Parent {
      @nested @observable leaf: Leaf;

      constructor(leaf: Leaf) {
        this.leaf = leaf;
        makeObservable(this);
      }
    }

    class Counter {
      @observable count = 0;
      readonly #limit: { readonly value: number };

      constructor(limit: { readonly value: number }) {
        this.#limit = limit;
        makeObservable(this);
      }

      @computed
      get isOverLimit() {
        return this.count > this.#limit.value;
      }
    }

    class WatchedCounter {
      @observable count = 0;
      readonly #limit: { readonly value: number };

      constructor(limit: { readonly value: number }) {
        this.#limit = limit;
        makeObservable(this);
      }

      @watch
      @computed
      get isOverLimit() {
        return this.count > this.#limit.value;
      }
    }

    class Tagged {
      @observable.ref tags: readonly string[];

      constructor(tags: readonly string[]) {
        this.tags = tags;
        makeObservable(this);
      }
    }

    /** Create a target, with its watcher if requested */
    function create(createTarget: () => object, withWatcher: boolean) {
      const target = createTarget();
      if (withWatcher) Watcher.get(target);
      return new WeakRef(target);
    }

    /** The number of derivations observing an observable */
    function countObservers(target: object) {
      return getObserverTree(target).observers?.length ?? 0;
    }

    it("releases the target although a @nested object outlives it", async () => {
      const shared = new Leaf();
      const withWatcher = create(() => new Parent(shared), true);
      // The watcher observes the watcher of `shared` with a reaction that `shared` keeps, but the reaction reaches the
      // target only through a WeakRef
      expect(await isCollected(withWatcher)).toBe(true);
      expect(shared.value).toBe(0);
    });

    it("releases the target although a @computed reads an outer observable", async () => {
      const limit = observable({ value: 10 });
      const withWatcher = create(() => new Counter(limit), true);
      // A watcher does not observe a @computed unless @watch is specified, and a computed that nothing observes does
      // not observe what it reads
      expect(await isCollected(withWatcher)).toBe(true);
      expect(limit.value).toBe(10);
    });

    it("keeps the target alive through a @watch @computed reading an outer observable", async () => {
      const limit = observable({ value: 10 });
      const withoutWatcher = create(() => new WatchedCounter(limit), false);
      const withWatcher = create(() => new WatchedCounter(limit), true);
      expect(await isCollected(withoutWatcher)).toBe(true);
      // While the watcher observes the computed, the computed observes `limit`, and a computed references the object it
      // belongs to, so `limit` keeps the target alive. MobX alone would let the target go, as a computed that nothing
      // observes does not observe what it reads.
      expect(await isCollected(withWatcher)).toBe(false);
      expect(limit.value).toBe(10);
    });

    it("releases the target although an @observable references an outer observable collection", async () => {
      const tags = observable(["a", "b"]);
      const withWatcher = create(() => new Tagged(tags), true);
      // To detect shallow changes, the watcher reads the elements of `tags`, which keeps the reaction
      expect(countObservers(tags)).toBe(1);
      expect(await isCollected(withWatcher)).toBe(true);
      // The finalization registry disposes the reaction in a task of its own, after the collection
      await vi.waitFor(() => expect(countObservers(tags)).toBe(0));
    });

    it("disposes the reaction of a collected target when what it observes changes before the finalization", async () => {
      const tags = observable(["a", "b"]);
      const withWatcher = create(() => new Tagged(tags), true);
      expect(await isCollected(withWatcher)).toBe(true);
      // The task in which the finalization registry disposes the reaction has not run yet
      expect(countObservers(tags)).toBe(1);
      runInAction(() => {
        tags.push("c");
      });
      expect(countObservers(tags)).toBe(0);
    });
  });
});

describe("Validator", () => {
  class Sample {
    @observable name = "";

    constructor(opt?: Validator.HandlerOptions) {
      makeObservable(this);
      addValidation(
        this,
        (b) => {
          if (!this.name) b.invalidate("name", "required");
        },
        opt
      );
      addValidation(
        this,
        () => this.name,
        async (name, b) => {
          if (name === "taken") b.invalidate("name", "taken");
        },
        opt
      );
    }
  }

  class Named {
    @observable name = "";

    constructor() {
      makeObservable(this);
    }
  }

  it("is garbage collected together with its target after sync and async validations", async () => {
    const refs = await (async () => {
      const sample = new Sample({ delayMs: 0 });
      const validator = Validator.get(sample);
      runInAction(() => {
        sample.name = "taken";
      });
      await vi.waitFor(() => expect(validator.getErrorMessages("name")).toEqual(new Set(["taken"])));
      return { sample: new WeakRef(sample), validator: new WeakRef(validator) };
    })();
    expect(await isCollected(refs.sample)).toBe(true);
    expect(await isCollected(refs.validator)).toBe(true);
  });

  it("keeps the target alive while a validation is scheduled, until reset() cancels it", async () => {
    const create = (reset: boolean) => {
      // Long enough that the scheduled validations cannot run during the test
      const sample = new Sample({ delayMs: 60_000 });
      runInAction(() => {
        sample.name = "taken";
      });
      expect(Validator.get(sample).reactionState).toBe(2);
      if (reset) Validator.get(sample).reset();
      return new WeakRef(sample);
    };
    const scheduled = create(false);
    const reset = create(true);
    expect(await isCollected(reset)).toBe(true);
    // The timer of a scheduled validation references its handler, and so the target, until it fires
    expect(await isCollected(scheduled)).toBe(false);
    Validator.get(scheduled.deref()!).reset(); // Cancel the timers, so that they do not outlive the test
  });

  it.each([
    { outcome: "resolves", abort: false },
    { outcome: "is aborted", abort: true },
  ])(
    "releases the target once a wait for its validation $outcome, although the signal passed to it lives on",
    async ({ abort }) => {
      const controller = new AbortController();
      const ref = await (async () => {
        const sample = new Sample({ delayMs: abort ? 60_000 : 0 });
        const validator = Validator.get(sample);
        runInAction(() => {
          sample.name = "taken";
        });
        const waiting = validator.waitForValidation({ signal: controller.signal });
        if (abort) {
          controller.abort();
          await expect(waiting).rejects.toBe(controller.signal.reason);
          validator.reset(); // Cancel the timers, which keep the target alive until they fire
        } else {
          await waiting;
        }
        return new WeakRef(sample);
      })();
      expect(await isCollected(ref)).toBe(true);
      // Until here, the test keeps the signal, and any listener still on it, alive
      expect(controller.signal.aborted).toBe(abort);
    }
  );

  it("releases a handler once it is disposed, even while its validation is scheduled", async () => {
    const named = new Named();
    const validator = Validator.get(named);
    const refs = await (async () => {
      const syncHandler = (b: ValidationErrorMapBuilder<Named>) => {
        if (!named.name) b.invalidate("name", "required");
      };
      const asyncHandler = async (name: string, b: ValidationErrorMapBuilder<Named>) => {
        if (!name) b.invalidate("name", "required");
      };
      const disposeSync = validator.addSyncHandler(syncHandler, { delayMs: 60_000 });
      const disposeAsync = validator.addAsyncHandler(() => named.name, asyncHandler, { delayMs: 60_000 });
      await vi.waitFor(() => expect(validator.asyncState).toBe(0));
      runInAction(() => {
        named.name = "value";
      });
      expect(validator.reactionState).toBe(2);
      disposeSync();
      disposeAsync();
      return { syncHandler: new WeakRef(syncHandler), asyncHandler: new WeakRef(asyncHandler) };
    })();
    expect(await isCollected(refs.syncHandler)).toBe(true);
    expect(await isCollected(refs.asyncHandler)).toBe(true);
    expect(validator.reactionState).toBe(0);
  });

  it("releases a target observed through an outer observable once its handler is disposed", async () => {
    const settings = observable({ minLength: 3 });
    const create = (dispose: boolean) => {
      const named = new Named();
      const disposeHandler = addValidation(named, (b) => {
        if (named.name.length < settings.minLength) b.invalidate("name", "too short");
      });
      if (dispose) disposeHandler();
      return new WeakRef(named);
    };
    const kept = create(false);
    const disposed = create(true);
    expect(await isCollected(disposed)).toBe(true);
    // Until a reaction is disposed, what it observes references it, so `settings` keeps the handler and the target alive
    expect(await isCollected(kept)).toBe(false);
    expect(settings.minLength).toBe(3);
  });
});
