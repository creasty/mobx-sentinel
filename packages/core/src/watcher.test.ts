import {
  type IObservableArray,
  computed,
  makeAutoObservable,
  makeObservable,
  observable,
  reaction,
  runInAction,
} from "mobx";
import { Watcher, debugWatcher, unwatch, watch } from "./watcher";
import { nested } from "./nested";
import { KeyPath } from "./keyPath";

/** A minimal model to be nested */
class Leaf {
  @observable value = 0;

  constructor() {
    makeObservable(this);
  }
}

describe("Watcher", () => {
  describe("constructor", () => {
    it("throws an error when attempted to be instantiated directly", () => {
      expect(() => {
        new (Watcher as any)();
      }).toThrowError(/private constructor/);
    });
  });

  describe(".get", () => {
    it("throws an error when a non-object is given", () => {
      expect(() => {
        Watcher.get(null as any);
      }).toThrowError(/Expected an object/);
      expect(() => {
        Watcher.get(1 as any);
      }).toThrowError(/Expected an object/);
    });

    it("returns the same instance for the same target", () => {
      const target = {};
      const watcher1 = Watcher.get(target);
      const watcher2 = Watcher.get(target);
      expect(watcher1).toBe(watcher2);
      expect(watcher1.id).toBe(watcher2.id);
    });

    it("returns different instances for different targets", () => {
      const target1 = {};
      const target2 = {};
      const watcher1 = Watcher.get(target1);
      const watcher2 = Watcher.get(target2);
      expect(watcher1).not.toBe(watcher2);
      expect(watcher1.id).not.toBe(watcher2.id);
    });

    it("throws a TypeError for every kind of non-object target, including functions", () => {
      for (const target of [undefined, null, 0, 1n, "", "str", true, Symbol("symbol"), () => {}]) {
        expect(() => Watcher.get(target as any)).toThrowError(TypeError);
        expect(() => Watcher.get(target as any)).toThrowError("target: Expected an object");
      }
    });

    it("returns the same instance as .getSafe", () => {
      const target = {};
      expect(Watcher.getSafe(target)).toBe(Watcher.get(target));
      expect(Watcher.get(target)).toBe(Watcher.getSafe(target));
    });

    it("accepts arrays as targets", () => {
      const target: unknown[] = [];
      expect(Watcher.get(target)).toBeInstanceOf(Watcher);
      expect(Watcher.get(target)).toBe(Watcher.get(target));
    });

    it("does not leave any enumerable trace on the target", () => {
      const target = { a: 1 };
      const watcher = Watcher.get(target);
      expect(Object.keys(target)).toEqual(["a"]);
      expect(JSON.stringify(target)).toBe('{"a":1}');

      // A spread copy does not carry the cached watcher over
      const copy = { ...target };
      expect(Watcher.get(copy)).not.toBe(watcher);
    });

    it("returns the watcher of the prototype for an object created with Object.create()", () => {
      const parent = {};
      const parentWatcher = Watcher.get(parent);
      const child = Object.create(parent);
      // PINNED(quirk): the cache is looked up with a plain property read, which follows the prototype chain, so an object inheriting from a watched object shares its watcher (only when the prototype's watcher is created first). Decide: should the cache check own properties only (e.g. Object.hasOwn) so that each object gets its own watcher?
      expect(Watcher.get(child)).toBe(parentWatcher);
    });

    it("throws a TypeError when the target is not extensible", () => {
      expect(() => Watcher.get(Object.freeze({}))).toThrowError(TypeError);
      expect(() => Watcher.get(Object.preventExtensions({}))).toThrowError(/not extensible/);
    });

    it("returns a watcher that tracks nothing for observable collections and boxed observables", () => {
      const array = observable.array([1]);
      const set = observable.set([1]);
      const map = observable.map([["a", 1]]);
      const box = observable.box(1);
      const watchers = [array, set, map, box].map((target) => Watcher.get(target));

      runInAction(() => {
        array.push(2);
        set.add(2);
        map.set("a", 2);
        box.set(2);
      });
      // PINNED(quirk): only the annotations of observable objects are collected, so mutations to an observable array/set/map or a box passed directly as the target are silently ignored. Decide: should Watcher.get() track their contents (as @watch does for properties), or reject such targets?
      expect(watchers.map((watcher) => watcher.changed)).toEqual([false, false, false, false]);
    });
  });

  describe(".getSafe", () => {
    it("returns null when the target is not an object", () => {
      expect(Watcher.getSafe(null as any)).toBeNull();
      expect(Watcher.getSafe(1 as any)).toBeNull();
    });

    it("returns null for every kind of non-object target, including functions", () => {
      for (const target of [undefined, null, 0, 1n, "", "str", true, Symbol("symbol"), () => {}]) {
        expect(Watcher.getSafe(target)).toBeNull();
      }
    });

    it("throws when the target is not extensible", () => {
      // PINNED(bug): getSafe() lets the TypeError from caching the watcher on a frozen / sealed / non-extensible object escape, although its JSDoc says it "returns null instead of throwing an error" (the docs only mention non-objects; Validator.getSafe has the identical JSDoc and is pinned as a bug in validator.test.ts). Expected: getSafe does not throw for objects, either by giving non-extensible objects a watcher (e.g. cached in a WeakMap; flip to `.toBeInstanceOf(Watcher)`) or by returning null (flip to `.toBeNull()`). Flip these assertions when fixing.
      expect(() => Watcher.getSafe(Object.freeze({}))).toThrowError(/not extensible/);
      expect(() => Watcher.getSafe(Object.seal({}))).toThrowError(/not extensible/);
    });

    it("throws when the target has invalid @nested annotations", () => {
      class Mixed {
        @nested @nested.hoist @observable field = new Leaf();

        constructor() {
          makeObservable(this);
        }
      }
      // getSafe() only guards against non-object targets; the deliberate annotation misuse error raised by getNestedAnnotations() is not swallowed
      expect(() => Watcher.getSafe(new Mixed())).toThrowError(/Mixed @nested annotations are not allowed/);
    });
  });

  describe("#id", () => {
    it("is a UUID v4 that stays the same for the target", () => {
      const target = {};
      const watcher = Watcher.get(target);
      expect(watcher.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(Watcher.get(target).id).toBe(watcher.id);
    });
  });

  describe(".isWatching", () => {
    it("returns true when watching is enabled", () => {
      expect(Watcher.isWatching).toBe(true);
    });
  });

  describe("#assumeChanged", () => {
    it("sets changed to true without incrementing changedTick", () => {
      const watcher = Watcher.get({});
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.changed).toBe(false);
      watcher.assumeChanged();
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.changed).toBe(true);
    });

    it("does not add any key or key path", () => {
      const watcher = Watcher.get(observable({ value: 0 }));
      watcher.assumeChanged();
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedKeyPaths).toEqual(new Set());
    });

    it("is idempotent and notifies observers of changed only once", () => {
      const watcher = Watcher.get({});
      const onChanged = vi.fn();
      const dispose = reaction(() => watcher.changed, onChanged);
      try {
        watcher.assumeChanged();
        watcher.assumeChanged();
        expect(onChanged).toHaveBeenCalledTimes(1);
        expect(onChanged).toHaveBeenLastCalledWith(true, false, expect.anything());
        expect(watcher.changed).toBe(true);
        expect(watcher.changedTick).toBe(0n);
      } finally {
        dispose();
      }
    });

    it("is ignored after unwatch() within the same transaction", () => {
      const watcher = Watcher.get({});
      runInAction(() => {
        unwatch(() => {});
        expect(Watcher.isWatching).toBe(false);
        watcher.assumeChanged();
      });
      expect(Watcher.isWatching).toBe(true);
      expect(watcher.changed).toBe(false);
    });

    it("is cleared by reset()", () => {
      const watcher = Watcher.get({});
      watcher.assumeChanged();
      watcher.reset();
      expect(watcher.changed).toBe(false);

      watcher.assumeChanged();
      expect(watcher.changed).toBe(true);
    });
  });

  describe("#reset", () => {
    it("resets the state", () => {
      const watcher = Watcher.get({});
      const internal = debugWatcher(watcher);

      watcher.assumeChanged();
      expect(watcher.changed).toBe(true);

      watcher.reset();
      expect(watcher.changed).toBe(false);

      internal.didChange("field1" as KeyPath);
      expect(watcher.changedTick).toBe(1n);
      expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      expect(watcher.changed).toBe(true);

      watcher.reset();
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changed).toBe(false);
    });

    it("clears the state even inside unwatch()", () => {
      const object = observable({ value: 0 });
      const watcher = Watcher.get(object);
      runInAction(() => {
        object.value = 1;
      });
      watcher.assumeChanged();

      unwatch(() => watcher.reset());
      expect(watcher.changed).toBe(false);
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.changedKeys).toEqual(new Set());
    });

    it("does not discard a change made earlier in the same transaction", () => {
      const object = observable({ value: 0 });
      const watcher = Watcher.get(object);
      runInAction(() => {
        object.value = 1;
        watcher.reset();
      });
      // PINNED(quirk): the reactions of Watcher run when the outermost transaction ends, so a change made before reset() in the same transaction is recorded after the reset. Decide: should reset() also discard changes pending in the current transaction (e.g. `runInAction(() => { model.load(data); watcher.reset(); })`)?
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["value"]));
      expect(watcher.changedTick).toBe(1n);
    });

    it("tracks a change made after reset() in the same transaction", () => {
      const object = observable({ value: 0 });
      const watcher = Watcher.get(object);
      watcher.assumeChanged();
      runInAction(() => {
        watcher.reset();
        object.value = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set(["value"]));
      expect(watcher.changedTick).toBe(1n);
    });

    it("resets nested watchers recursively", () => {
      class Middle {
        @nested @observable leaf = new Leaf();

        constructor() {
          makeObservable(this);
        }
      }
      class Root {
        @nested @observable middle = new Middle();

        constructor() {
          makeObservable(this);
        }
      }

      const root = new Root();
      const watcher = Watcher.get(root);
      runInAction(() => {
        root.middle.leaf.value = 1;
      });
      expect(watcher.changedKeyPaths).toEqual(new Set(["middle.leaf.value"]));
      expect(Watcher.get(root.middle).changed).toBe(true);
      expect(Watcher.get(root.middle.leaf).changed).toBe(true);

      watcher.reset();
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeyPaths).toEqual(new Set());
      expect(Watcher.get(root.middle).changed).toBe(false);
      expect(Watcher.get(root.middle.leaf).changed).toBe(false);
    });
  });

  describe("#changedTick", () => {
    class Sample {
      @observable field = 0;
      @observable other = 0;

      constructor() {
        makeObservable(this);
      }
    }

    it("is a bigint starting at 0n", () => {
      const watcher = Watcher.get(new Sample());
      expectTypeOf(watcher.changedTick).toEqualTypeOf<bigint>();
      expect(watcher.changedTick).toBe(0n);
    });

    it("keeps increasing on repeated changes to the same key", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      for (const [i, value] of [1, 2, 3].entries()) {
        runInAction(() => {
          sample.field = value;
        });
        expect(watcher.changedTick).toBe(BigInt(i + 1));
        expect(watcher.changedKeys).toEqual(new Set(["field"]));
      }
    });

    it("counts reverting to the original value as a change", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.field = 1;
      });
      runInAction(() => {
        sample.field = 0;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedTick).toBe(2n);
    });

    it("notifies observers once per transaction", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const onTick = vi.fn();
      const dispose = reaction(() => watcher.changedTick, onTick);
      try {
        runInAction(() => {
          sample.field = 1;
          sample.other = 1;
        });
        expect(onTick).toHaveBeenCalledTimes(1);
        expect(onTick).toHaveBeenLastCalledWith(2n, 0n, expect.anything());

        watcher.reset();
        expect(onTick).toHaveBeenCalledTimes(2);
        expect(onTick).toHaveBeenLastCalledWith(0n, 2n, expect.anything());

        watcher.reset();
        expect(onTick).toHaveBeenCalledTimes(2);
      } finally {
        dispose();
      }
    });
  });

  describe("#changed", () => {
    class Sample {
      @observable field = 0;

      constructor() {
        makeObservable(this);
      }
    }

    it("notifies observers only when the value flips", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const onChanged = vi.fn();
      const dispose = reaction(() => watcher.changed, onChanged);
      try {
        runInAction(() => {
          sample.field = 1;
        });
        expect(onChanged).toHaveBeenCalledTimes(1);

        runInAction(() => {
          sample.field = 2;
        });
        expect(onChanged).toHaveBeenCalledTimes(1);

        watcher.reset();
        expect(onChanged).toHaveBeenCalledTimes(2);
        expect(onChanged).toHaveBeenLastCalledWith(false, true, expect.anything());
      } finally {
        dispose();
      }
    });
  });

  describe("#changedKeys", () => {
    class Sample {
      @observable field = 0;
      @observable other = 0;

      constructor() {
        makeObservable(this);
      }
    }

    it("returns a copy that does not leak mutations back", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      runInAction(() => {
        sample.field = 1;
      });

      (watcher.changedKeys as Set<KeyPath>).add("injected" as KeyPath);
      (watcher.changedKeys as Set<KeyPath>).delete("field" as KeyPath);
      expect(watcher.changedKeys).toEqual(new Set(["field"]));
    });

    it("returns a new set on every read outside a reactive context", () => {
      const watcher = Watcher.get(new Sample());
      expect(watcher.changedKeys).not.toBe(watcher.changedKeys);
      expect(watcher.changedKeyPaths).not.toBe(watcher.changedKeyPaths);
    });

    it("notifies observers only when the set of keys changes", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const onKeys = vi.fn();
      const dispose = reaction(() => watcher.changedKeys, onKeys);
      try {
        runInAction(() => {
          sample.field = 1;
        });
        expect(onKeys).toHaveBeenCalledTimes(1);

        runInAction(() => {
          sample.field = 2;
        });
        expect(onKeys).toHaveBeenCalledTimes(1);

        runInAction(() => {
          sample.other = 1;
        });
        expect(onKeys).toHaveBeenCalledTimes(2);

        watcher.reset();
        expect(onKeys).toHaveBeenCalledTimes(3);
        watcher.reset();
        expect(onKeys).toHaveBeenCalledTimes(3);
      } finally {
        dispose();
      }
    });
  });

  describe("#changedKeyPaths", () => {
    class Sample {
      @observable field = 0;
      @nested @observable child = new Leaf();

      constructor() {
        makeObservable(this);
      }
    }

    it("includes both own keys and nested key paths", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      runInAction(() => {
        sample.field = 1;
        sample.child.value = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set(["field"]));
      expect(watcher.changedKeyPaths).toEqual(new Set(["field", "child.value"]));
    });

    it("notifies observers only when the set of key paths changes", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const onKeyPaths = vi.fn();
      const dispose = reaction(() => watcher.changedKeyPaths, onKeyPaths);
      try {
        runInAction(() => {
          sample.child.value = 1;
        });
        expect(onKeyPaths).toHaveBeenCalledTimes(1);

        runInAction(() => {
          sample.child.value = 2;
        });
        expect(onKeyPaths).toHaveBeenCalledTimes(1);

        Watcher.get(sample.child).reset();
        expect(onKeyPaths).toHaveBeenCalledTimes(2);
        expect(watcher.changedKeyPaths).toEqual(new Set());
      } finally {
        dispose();
      }
    });
  });

  describe("#nested", () => {
    class Sample {
      @nested @observable items = [new Leaf()];
      @nested @observable mixed: unknown[] = [1, "a", null, undefined, new Leaf()];
      @nested @observable map = new Map([[1, new Leaf()]]);

      constructor() {
        makeObservable(this);
      }
    }

    it("ignores values that are not objects", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect([...watcher.nested.keys()]).toEqual(["items.0", "mixed.4", "map.1"]);
      expect(watcher.nested.get("mixed.4" as KeyPath)).toBe(Watcher.get(sample.mixed[4] as Leaf));
    });

    it("stringifies non-string map keys in key paths", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      runInAction(() => {
        sample.map.get(1)!.value = 1;
      });
      expect(watcher.changedKeyPaths).toEqual(new Set(["map.1.value"]));
    });

    it("follows structural changes of nested collections", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const first = sample.items[0];
      const second = new Leaf();

      runInAction(() => {
        sample.items.push(second);
      });
      expect(watcher.nested.get("items.0" as KeyPath)).toBe(Watcher.get(first));
      expect(watcher.nested.get("items.1" as KeyPath)).toBe(Watcher.get(second));

      runInAction(() => {
        sample.items.splice(0, 1);
      });
      expect(watcher.nested.get("items.0" as KeyPath)).toBe(Watcher.get(second));
      expect(watcher.nested.has("items.1" as KeyPath)).toBe(false);
    });

    it("notifies observers on structural changes only", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const onNested = vi.fn();
      const dispose = reaction(() => watcher.nested, onNested);
      try {
        runInAction(() => {
          sample.items[0].value = 1;
        });
        expect(onNested).toHaveBeenCalledTimes(0);

        runInAction(() => {
          sample.items.push(new Leaf());
        });
        expect(onNested).toHaveBeenCalledTimes(1);
      } finally {
        dispose();
      }
    });
  });

  describe("creation inside a transaction", () => {
    it("does NOT track changes made later in the same transaction", () => {
      const object = observable({ value: 0, other: 0 });
      let watcher!: Watcher;
      runInAction(() => {
        watcher = Watcher.get(object);
        object.value = 1;
      });
      // PINNED(bug): the reactions of a watcher created inside a transaction take their first reading only when the transaction ends, so changes made after Watcher.get() in the same transaction become the baseline (e.g. a model created and edited inside one action). Expected: tracked, as the docs say "Watching starts immediately when the Watcher instance is created". Flip this assertion when fixing.
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        object.other = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set(["other"]));
    });

    it("tracks changes made after unwatch() ends when created inside unwatch()", () => {
      const object = observable({ value: 0 });
      let watcher!: Watcher;
      unwatch(() => {
        watcher = Watcher.get(object);
      });
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        object.value = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set(["value"]));
    });
  });

  describe("method binding", () => {
    it("reset() and assumeChanged() throw when called without the watcher as `this`", () => {
      const watcher = Watcher.get({});
      const { reset, assumeChanged } = watcher;
      // PINNED(quirk): the methods are decorated with @action, not @action.bound, so passing them as callbacks (e.g. `onClick={watcher.reset}`) throws a TypeError. Decide: should reset() and assumeChanged() be bound?
      expect(() => reset()).toThrowError(TypeError);
      expect(() => assumeChanged()).toThrowError(TypeError);
    });
  });

  describe("lifecycle", () => {
    class Sample {
      @observable field = 0;
      @nested @observable child = new Leaf();

      constructor() {
        makeObservable(this);
      }
    }

    it("tracks own and nested changes again after each reset()", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const childWatcher = Watcher.get(sample.child);

      runInAction(() => {
        sample.child.value = 1;
      });
      expect(watcher.changedTick).toBe(1n);
      watcher.reset();
      expect(childWatcher.changed).toBe(false);

      runInAction(() => {
        sample.child.value = 2;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedTick).toBe(1n);
      expect(watcher.changedKeyPaths).toEqual(new Set(["child.value"]));

      watcher.reset();
      runInAction(() => {
        sample.field = 1;
        sample.child.value = 3;
      });
      expect(watcher.changedTick).toBe(2n);
      expect(watcher.changedKeys).toEqual(new Set(["field"]));
      expect(watcher.changedKeyPaths).toEqual(new Set(["field", "child.value"]));

      // Replacing the changed child: one tick for the key, none for the (now unchanged) nested watcher
      runInAction(() => {
        sample.child = new Leaf();
      });
      expect(watcher.changedTick).toBe(3n);
      expect(watcher.changedKeyPaths).toEqual(new Set(["field", "child"]));
    });

    it("reset() notifies observers once, even when nested watchers are reset too", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      runInAction(() => {
        sample.field = 1;
        sample.child.value = 1;
      });
      expect(watcher.changedTick).toBe(2n);

      const onKeyPaths = vi.fn();
      const onChanged = vi.fn();
      const disposers = [
        reaction(() => watcher.changedKeyPaths, onKeyPaths),
        reaction(() => watcher.changed, onChanged),
      ];
      try {
        watcher.reset();
        expect(onKeyPaths).toHaveBeenCalledTimes(1);
        expect(onKeyPaths).toHaveBeenLastCalledWith(new Set(), new Set(["field", "child.value"]), expect.anything());
        expect(onChanged).toHaveBeenCalledTimes(1);
        expect(onChanged).toHaveBeenLastCalledWith(false, true, expect.anything());
      } finally {
        for (const dispose of disposers) dispose();
      }
    });

    it("mutates its state in actions, so observing a watcher causes no strict-mode warnings", () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const watcher = Watcher.get({});
      const dispose = reaction(
        () => [watcher.changed, watcher.changedTick, watcher.changedKeys],
        () => {}
      );
      try {
        watcher.assumeChanged();
        debugWatcher(watcher).didChange("key" as KeyPath);
        expect(watcher.changedKeys).toEqual(new Set(["key"]));
        watcher.reset();
        expect(watcher.changed).toBe(false);
        expect(consoleWarn).not.toHaveBeenCalled();
      } finally {
        dispose();
        consoleWarn.mockRestore();
      }
    });
  });
});

describe("unwatch()", () => {
  it("disables watching in the function", () => {
    expect(Watcher.isWatching).toBe(true);
    unwatch(() => {
      expect(Watcher.isWatching).toBe(false);
    });
    expect(Watcher.isWatching).toBe(true);
  });

  it("handles nested unwatch() calls properly", () => {
    expect(Watcher.isWatching).toBe(true);
    unwatch(() => {
      expect(Watcher.isWatching).toBe(false);
      unwatch(() => {
        expect(Watcher.isWatching).toBe(false);
      });
      expect(Watcher.isWatching).toBe(false);
    });
    expect(Watcher.isWatching).toBe(true);
  });

  it("unwatch() ends when the current transaction completes", () => {
    runInAction(() => {
      unwatch(() => {
        expect(Watcher.isWatching).toBe(false);
      });
      expect(Watcher.isWatching).toBe(false); // Doesn't become true until the current transaction completes
      unwatch(() => {
        expect(Watcher.isWatching).toBe(false);
      });
    });
    expect(Watcher.isWatching).toBe(true);
  });

  it("runs the function without changes being detected by Watcher", () => {
    const object = observable({ value: 0 });
    const watcher = Watcher.get(object);
    const internal = debugWatcher(watcher);

    unwatch(() => {
      watcher.assumeChanged();
    });
    expect(watcher.changed).toBe(false);

    unwatch(() => {
      internal.didChange("value" as KeyPath);
    });
    expect(watcher.changed).toBe(false);

    // Inner transaction
    unwatch(() => {
      runInAction(() => {
        object.value++;
      });
    });
    expect(watcher.changed).toBe(false);
  });

  it("works when unwatch() function has outer transactions", () => {
    const object = observable({ value: 0, other: 0 });
    const watcher = Watcher.get(object);

    runInAction(() => {
      unwatch(() => {
        object.value++;
      });
    });
    expect(watcher.changed).toBe(false);

    runInAction(() => {
      unwatch(() => {
        object.value++;
      });
      object.other++;
    });
    expect(watcher.changed).toBe(true);
    expect(watcher.changedKeys).toEqual(new Set(["other"])); // "value" is not included
  });

  it("returns undefined", () => {
    expect(unwatch(() => {})).toBeUndefined();
    expectTypeOf(unwatch(() => {})).toBeVoid();
  });

  it("rethrows an error from the function and restores watching", () => {
    const object = observable({ value: 0 });
    const watcher = Watcher.get(object);

    expect(() =>
      unwatch(() => {
        object.value++;
        throw new Error("boom");
      })
    ).toThrowError("boom");
    expect(Watcher.isWatching).toBe(true);
    expect(watcher.changed).toBe(false);

    runInAction(() => {
      object.value++;
    });
    expect(watcher.changedKeys).toEqual(new Set(["value"]));
  });

  it("restores watching when the function throws inside an outer transaction", () => {
    runInAction(() => {
      expect(() =>
        unwatch(() => {
          throw new Error("boom");
        })
      ).toThrowError("boom");
      expect(Watcher.isWatching).toBe(false);
    });
    expect(Watcher.isWatching).toBe(true);
  });

  it("drops a change made before unwatch() in the same transaction, and tracks one made after", () => {
    // The example of "Warning about transactions" in the docs of the core package
    const object = observable({ field1: false, field2: false, field3: false });
    const watcher = Watcher.get(object);

    runInAction(() => {
      object.field1 = true;
      unwatch(() => {
        object.field2 = true;
      });
      object.field3 = true;
    });
    expect(watcher.changedKeys.has("field2" as KeyPath)).toBe(false);
    // PINNED(bug): the reaction for field1 is scheduled before unwatch() but only runs when the transaction ends, while unwatching is still in effect, so the change is dropped. Expected: tracked, as the docs say ("Tracked: Before unwatch begins"). Flip this assertion when fixing.
    expect(watcher.changedKeys.has("field1" as KeyPath)).toBe(false);
    // PINNED(quirk): field3 is tracked because its reaction is scheduled after unwatching ends, contradicting the docs ("NOT tracked: Still in the same transaction as unwatch"); the test "works when unwatch() function has outer transactions" relies on this. Decide: fix the docs, or the behavior?
    expect(watcher.changedKeys.has("field3" as KeyPath)).toBe(true);
  });

  it("drops a change to a key that is changed both before and after unwatch() in the same transaction", () => {
    const object = observable({ value: 0, other: 0 });
    const watcher = Watcher.get(object);

    runInAction(() => {
      object.value = 1;
      unwatch(() => {
        object.other = 1;
      });
      object.value = 2;
    });
    // PINNED(bug): the reaction for "value" is already scheduled before unwatch(), so both changes are dropped. Expected: `true` (the key was changed outside unwatch() twice). Flip this assertion when fixing.
    expect(watcher.changed).toBe(false);
  });

  it("returns undefined for an async function, and changes after the first await are tracked", async () => {
    const object = observable({ value: 0 });
    const watcher = Watcher.get(object);
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const result = unwatch(async () => {
      runInAction(() => {
        object.value = 1;
      });
      await Promise.resolve();
      runInAction(() => {
        object.value = 2;
      });
      finish();
    });
    expect(result).toBeUndefined();
    expect(watcher.changed).toBe(false);

    await finished;
    // PINNED(quirk): unwatch() only covers the synchronous part of the function and discards the returned promise. Decide: should unwatch() reject/await async functions, or document the limitation?
    expect(watcher.changed).toBe(true);
    expect(watcher.changedKeys).toEqual(new Set(["value"]));
  });

  it("suppresses changes to nested objects", () => {
    class Sample {
      @nested @observable child = new Leaf();

      constructor() {
        makeObservable(this);
      }
    }
    const sample = new Sample();
    const watcher = Watcher.get(sample);

    unwatch(() => {
      sample.child.value = 1;
    });
    expect(Watcher.get(sample.child).changed).toBe(false);
    expect(watcher.changed).toBe(false);
    expect(watcher.changedKeyPaths).toEqual(new Set());
  });

  it("does nothing when called with something other than a single function", () => {
    const object = observable({ value: 0 });
    const watcher = Watcher.get(object);

    expect((unwatch as any)(1)).toBeUndefined();
    expect((unwatch as any)()).toBeUndefined();
    expect(Watcher.isWatching).toBe(true);

    runInAction(() => {
      object.value = 1;
    });
    expect(watcher.changedKeys).toEqual(new Set(["value"]));
  });

  it("has no `ref` variant", () => {
    // PINNED(bug): the JSDoc of `watch` says @observable/@computed are watched "unless `@unwatch` or `@unwatch.ref` is specified", but `unwatch.ref` does not exist. Expected: the JSDoc stops mentioning `@unwatch.ref`, or it gets implemented (then flip this assertion and drop the @ts-expect-error).
    // @ts-expect-error: unwatch.ref is not defined
    expect(unwatch.ref).toBeUndefined();
  });
});

describe("Annotations", () => {
  describe("@observable / @computed", () => {
    class Sample {
      @observable field1 = false;
      @observable field2 = false;

      constructor() {
        makeObservable(this);
      }

      @computed
      get computed1() {
        return this.field1;
      }

      @computed
      get computed2() {
        return this.field2;
      }

      @computed
      get computed3() {
        return this.field1 || this.field2;
      }
    }

    test("changes to @observable/@computed fields are tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "computed3"]));

      runInAction(() => {
        sample.field2 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "field2", "computed2", "computed3"]));
    });

    test("changedTick is incremented for each change", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changedTick).toBe(0n);

      runInAction(() => {
        sample.field1 = true;
      });
      // 1 change to 3 fields each (field1, computed1, computed3)
      expect(watcher.changedTick).toBe(3n);

      runInAction(() => {
        sample.field2 = true;
      });
      // 1 change to 2 fields each (field2, computed2)
      // Since the value of computed3 is constant, it won't be counted.
      expect(watcher.changedTick).toBe(3n + 2n);

      runInAction(() => {
        sample.field1 = false;
        sample.field2 = false;
      });
      // 1 change to all 5 fields each
      // Since runInAction is used, change to field1 and field2 are counted as 1 change.
      expect(watcher.changedTick).toBe(3n + 2n + 5n);
    });

    test("when the value is not changed, the watcher is not updated", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = false; // same value as before
      });
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
    });

    test("reset() resets changed, changedKeys, and changedTick", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedTick).toBe(0n);

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "computed3"]));
      expect(watcher.changedTick).toBe(3n);

      watcher.reset();
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedTick).toBe(0n);
    });

    describe("object", () => {
      class Sample {
        @observable field1 = { value: false };

        constructor() {
          makeObservable(this);
        }
      }

      test("changes to an object are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("array", () => {
      class Sample {
        @observable field1 = [false];
        @observable field2 = [{ value: false }];

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to an array are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1[0] = true;
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("mutations to an array are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.push(true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to array elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("set", () => {
      class Sample {
        @observable field1 = new Set([false]);
        @observable field2 = new Set([{ value: false }]);

        constructor() {
          makeObservable(this);
        }
      }

      test("mutations to a set are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.add(true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to set elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("map", () => {
      class Sample {
        @observable field1 = new Map([["key1", false]]);
        @observable field2 = new Map([["key1", { value: false }]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to a map are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.set("key2", true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to map elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });
  });

  describe("@watch", () => {
    class Sample {
      @watch field1 = observable.box(false);
      @watch field2 = observable.box(false);

      constructor() {
        makeObservable(this);
      }

      readonly #computed1 = computed(() => this.field1.get());
      @watch
      get computed1() {
        return this.#computed1.get();
      }

      readonly #computed2 = computed(() => this.field2.get());
      @watch
      get computed2() {
        return this.#computed2.get();
      }

      readonly #computed3 = computed(() => this.field1.get() || this.field2.get());
      @watch
      get computed3() {
        return this.#computed3.get();
      }
    }

    test("changes to @watch fields are tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1.set(true);
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "computed3"]));

      runInAction(() => {
        sample.field2.set(true);
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "field2", "computed2", "computed3"]));
    });
  });

  describe("@unwatch", () => {
    class Sample {
      @unwatch @observable field1 = false;
      @observable field2 = false;

      constructor() {
        makeObservable(this);
      }

      @unwatch
      @computed
      get computed1() {
        return this.field1;
      }

      @unwatch
      @computed
      get computed2() {
        return this.field2;
      }

      @computed
      get computed3() {
        return this.field1 || this.field2;
      }
    }

    test("changes to @unwatch fields are ignored", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["computed3"]));

      runInAction(() => {
        sample.field2 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field2", "computed3"]));
    });
  });

  describe("@watch.ref", () => {
    describe("object", () => {
      class Sample {
        @watch.ref @observable field1 = { value: false };

        constructor() {
          makeObservable(this);
        }
      }

      test("changes to an object are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("array", () => {
      class Sample {
        @watch.ref @observable field1 = [false];
        @watch.ref @observable field2 = [{ value: false }];

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to an array are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1[0] = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("mutations to an array are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.push(true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to array elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("set", () => {
      class Sample {
        @watch.ref @observable field1 = new Set([false]);
        @watch.ref @observable field2 = new Set([{ value: false }]);

        constructor() {
          makeObservable(this);
        }
      }

      test("mutations to a set are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.add(true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to set elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("map", () => {
      class Sample {
        @watch.ref @observable field1 = new Map([["key1", false]]);
        @watch.ref @observable field2 = new Map([["key1", { value: false }]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to a map are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.set("key2", true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to map elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });
  });

  describe("@nested", () => {
    describe("non-nested value", () => {
      class Sample {
        @nested @observable field1 = 1;

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are not created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.size).toBe(0);
      });
    });

    describe("object", () => {
      class Sample {
        @nested @observable field1 = { value: false };
        @nested field2 = observable({ value: false });

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1" as KeyPath)).toBe(Watcher.get(sample.field1));
        expect(watcher.nested.get("field2" as KeyPath)).toBe(Watcher.get(sample.field2));
        expect(watcher.nested.size).toBe(2);
      });

      test("changes to an object are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.value = true;
          sample.field2.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.value", "field2.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("boxed observable", () => {
      class Sample {
        @nested field1 = observable.box({ value: false });
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1" as KeyPath)).toBe(Watcher.get(sample.field1.get()));
        expect(watcher.nested.size).toBe(1);
      });

      test("assignments to a boxed observable field are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.set({ value: true });
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1"]));
        expect(watcher.changed).toBe(true);
      });

      test("changes to a boxed observable field are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.get().value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("array", () => {
      class Sample {
        @nested @observable field1 = [{ value: false }];
        @nested field2 = [observable({ value: false })];

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1.0" as KeyPath)).toBe(Watcher.get(sample.field1[0]));
        expect(watcher.nested.get("field2.0" as KeyPath)).toBe(Watcher.get(sample.field2[0]));
        expect(watcher.nested.size).toBe(2);
      });

      test("changes to array elements are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1[0].value = true;
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.0.value", "field2.0.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1.0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1.0" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2.0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2.0" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("set", () => {
      class Sample {
        @nested @observable field1 = new Set([{ value: false }]);
        @nested field2 = new Set([observable({ value: false })]);

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1.0" as KeyPath)).toBe(Watcher.get(Array.from(sample.field1)[0]));
        expect(watcher.nested.get("field2.0" as KeyPath)).toBe(Watcher.get(Array.from(sample.field2)[0]));
        expect(watcher.nested.size).toBe(2);
      });

      test("changes to set elements are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          for (const element of sample.field1) {
            element.value = true;
          }
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.0.value", "field2.0.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1.0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1.0" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2.0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2.0" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("map", () => {
      class Sample {
        @nested @observable field1 = new Map([["key1", { value: false }]]);
        @nested field2 = new Map([["key1", observable({ value: false })]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1.key1" as KeyPath)).toBe(Watcher.get(sample.field1.get("key1")!));
        expect(watcher.nested.get("field2.key1" as KeyPath)).toBe(Watcher.get(sample.field2.get("key1")!));
        expect(watcher.nested.size).toBe(2);
      });

      test("changes to map elements are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.get("key1")!.value = true;
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.key1.value", "field2.key1.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1.key1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1.key1" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2.key1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2.key1" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("class", () => {
      class Sample {
        @nested field1 = new Other();
        @nested @observable field2 = new Other();

        constructor() {
          makeObservable(this);
        }
      }

      class Other {
        @observable value = false;

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.size).toBe(2);
        expect(watcher.nested.get("field1" as KeyPath)).toBe(Watcher.get(sample.field1));
        expect(watcher.nested.get("field2" as KeyPath)).toBe(Watcher.get(sample.field2));
      });

      test("changes to a nested class are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.value = true;
          sample.field2.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.value", "field2.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2" as KeyPath)?.changed).toBe(true);
      });

      test("resetting a nested object does not reset the parent", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        const watcherNested = Watcher.get(sample.field1);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changed).toBe(true);
        expect(watcherNested.changed).toBe(true);

        watcherNested.reset();
        expect(watcher.changed).toBe(true);
        expect(watcherNested.changed).toBe(false);
      });

      test("the parent can reset all nested objects recursively", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        const watcherNested = Watcher.get(sample.field1);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changed).toBe(true);
        expect(watcherNested.changed).toBe(true);

        watcher.reset();
        expect(watcher.changed).toBe(false);
        expect(watcherNested.changed).toBe(false);
      });
    });
  });

  describe("@nested.hoist", () => {
    describe("class", () => {
      class Sample {
        @nested.hoist other = new Other();

        constructor() {
          makeObservable(this);
        }
      }

      class Other {
        @observable value = false;

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created with KeyPath.Self", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.size).toBe(1);
        expect(watcher.nested.get("other" as KeyPath)).toBeFalsy();
        expect(watcher.nested.get(KeyPath.Self)).toBe(Watcher.get(sample.other));
      });

      test("changes to a nested class are tracked and hoisted", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.other.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get(KeyPath.Self)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get(KeyPath.Self)?.changed).toBe(true);
      });
    });

    describe("array", () => {
      class Sample {
        @nested.hoist list = [new Other()];

        constructor() {
          makeObservable(this);
        }
      }

      class Other {
        @observable value = false;

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created with KeyPath.Self", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.size).toBe(1);
        expect(watcher.nested.get("list" as KeyPath)).toBeFalsy();
        expect(watcher.nested.get("0" as KeyPath)).toBe(Watcher.get(sample.list[0]));
      });

      test("changes to a nested class are tracked and hoisted", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.list[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["0.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("0" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("observable array", () => {
      class Sample {
        @nested.hoist @observable list = [new Leaf()];

        constructor() {
          makeObservable(this);
        }
      }

      test("mutations to the hoisted collection increment changedTick without adding a key", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.list.push(new Leaf());
        });
        expect(watcher.changed).toBe(true);
        expect(watcher.changedTick).toBe(1n);
        expect(watcher.changedKeys).toEqual(new Set());
        expect(watcher.changedKeyPaths).toEqual(new Set());
        expect([...watcher.nested.keys()]).toEqual(["0", "1"]);
      });

      test("reassignments to the hoisted property increment changedTick without adding a key", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.list = [];
        });
        expect(watcher.changedTick).toBe(1n);
        expect(watcher.changedKeys).toEqual(new Set());
        expect(watcher.nested.size).toBe(0);
      });

      test("mutations to the hoisted collection inside unwatch() are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        unwatch(() => {
          sample.list.push(new Leaf());
        });
        expect(watcher.changed).toBe(false);
        expect(watcher.changedTick).toBe(0n);
      });
    });
  });

  describe("@observable variants", () => {
    class Sample {
      @observable.struct struct = { a: 1 };
      @observable deep = { a: 1 };
      @observable.ref ref = [1];
      @observable.shallow shallow = [{ a: 1 }];

      constructor() {
        makeObservable(this);
      }
    }

    test("@observable.struct: assigning a structurally equal value is NOT tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.struct = { a: 1 };
      });
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        sample.struct = { a: 2 };
      });
      expect(watcher.changedKeys).toEqual(new Set(["struct"]));
    });

    test("@observable: assigning the same reference is NOT tracked, but an equal new object is", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      const same = sample.deep;
      runInAction(() => {
        sample.deep = same;
      });
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        sample.deep = { a: 1 };
      });
      expect(watcher.changedKeys).toEqual(new Set(["deep"]));
    });

    test("@observable.ref: mutations are NOT tracked, but assignments are", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.ref.push(2);
      });
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        sample.ref = [1, 2];
      });
      expect(watcher.changedKeys).toEqual(new Set(["ref"]));
    });

    test("@observable.shallow: mutations are tracked, but changes to elements are NOT", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.shallow[0].a = 2;
      });
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        sample.shallow.push({ a: 3 });
      });
      expect(watcher.changedKeys).toEqual(new Set(["shallow"]));
    });
  });

  describe("collection mutations", () => {
    class Sample {
      @observable array = [1, 2];
      @observable set = new Set([1]);
      @observable map = new Map([["a", 1]]);

      constructor() {
        makeObservable(this);
      }
    }

    test.each<[name: string, mutate: (sample: Sample) => void, expected: string[]]>([
      ["array: pop()", (s) => s.array.pop(), ["array"]],
      ["array: shift()", (s) => s.array.shift(), ["array"]],
      ["array: unshift()", (s) => s.array.unshift(0), ["array"]],
      ["array: splice()", (s) => s.array.splice(0, 1, 3), ["array"]],
      [
        "array: setting length",
        (s) => {
          s.array.length = 0;
        },
        ["array"],
      ],
      [
        "array: assigning the same element",
        (s) => {
          s.array[0] = 1;
        },
        [],
      ],
      ["array: push() without arguments", (s) => s.array.push(), []],
      ["array: splice() without removal or insertion", (s) => s.array.splice(0, 0), []],
      ["set: delete()", (s) => s.set.delete(1), ["set"]],
      ["set: clear()", (s) => s.set.clear(), ["set"]],
      ["set: adding an existing element", (s) => s.set.add(1), []],
      ["set: deleting a missing element", (s) => s.set.delete(0), []],
      ["map: setting a new value", (s) => s.map.set("a", 2), ["map"]],
      ["map: delete()", (s) => s.map.delete("a"), ["map"]],
      ["map: clear()", (s) => s.map.clear(), ["map"]],
      ["map: setting the same value", (s) => s.map.set("a", 1), []],
      ["map: deleting a missing key", (s) => s.map.delete("b"), []],
    ])("%s", (_name, mutate, expected) => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => mutate(sample));
      expect(watcher.changedKeys).toEqual(new Set(expected));
      expect(watcher.changedTick).toBe(BigInt(expected.length));
    });

    test("replacing the contents of an array with identical elements is tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        (sample.array as IObservableArray<number>).replace([1, 2]);
      });
      // PINNED(quirk): shallow watching compares fresh copies (slice()) by identity, so any notification from the collection counts even when its contents end up identical. Decide: should shallow watching compare the copies with comparer.shallow, as "shallow comparison" in the docs suggests?
      expect(watcher.changedKeys).toEqual(new Set(["array"]));
    });
  });

  describe("makeAutoObservable()", () => {
    class Sample {
      value = 0;

      constructor() {
        makeAutoObservable(this);
      }

      get double() {
        return this.value * 2;
      }

      increment() {
        this.value++;
      }
    }

    test("observable fields and computed getters are tracked, but actions are not", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      sample.increment();
      expect(watcher.changedKeys).toEqual(new Set(["value", "double"]));
      expect(watcher.changedTick).toBe(2n);
    });
  });

  describe("observable() objects", () => {
    test("keys added after the watcher is created are NOT tracked", () => {
      const object = observable<Record<string, number>>({ a: 0 });
      const watcher = Watcher.get(object);

      runInAction(() => {
        object.b = 1;
      });
      runInAction(() => {
        object.b = 2;
      });
      // PINNED(quirk): observable keys are collected once when the watcher is created, so keys added later (and changes to them) go unnoticed. Decide: should Watcher follow the keys of dynamic observable objects?
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        object.a = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set(["a"]));
    });
  });

  describe("a watcher created before makeObservable()", () => {
    class Sample {
      @observable value = 0;
      readonly watcher: Watcher;

      constructor() {
        this.watcher = Watcher.get(this);
        makeObservable(this);
      }
    }

    test("never tracks the annotations applied afterwards", () => {
      const sample = new Sample();
      expect(Watcher.get(sample)).toBe(sample.watcher);

      runInAction(() => {
        sample.value = 1;
      });
      // PINNED(quirk): the watcher collects MobX annotations once in its constructor and is cached, so annotations applied afterwards are never tracked. Decide: should Watcher collect annotations lazily, or detect this misuse (the docs only warn about the order for makeValidatable())?
      expect(sample.watcher.changed).toBe(false);
    });
  });

  describe("@computed evaluation", () => {
    test("Watcher.get() evaluates each @computed once and keeps it cached", () => {
      const evaluate = vi.fn();
      class Sample {
        @observable value = 0;

        constructor() {
          makeObservable(this);
        }

        @computed
        get derived() {
          evaluate();
          return this.value;
        }
      }

      const sample = new Sample();
      expect(evaluate).toHaveBeenCalledTimes(0);

      Watcher.get(sample);
      expect(evaluate).toHaveBeenCalledTimes(1);

      expect(sample.derived).toBe(0);
      expect(sample.derived).toBe(0);
      expect(evaluate).toHaveBeenCalledTimes(1);
    });

    test("an error thrown by a @computed is reported by MobX, and other keys are still tracked", () => {
      class Sample {
        @observable fail = false;

        constructor() {
          makeObservable(this);
        }

        @computed
        get risky() {
          if (this.fail) throw new Error("risky");
          return 1;
        }
      }

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.fail = true;
        });
        expect(consoleError).toHaveBeenCalled();
        expect(watcher.changedKeys).toEqual(new Set(["fail"]));
        expect(watcher.changedTick).toBe(1n);
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("inheritance", () => {
    class Base {
      @observable baseField = 0;
      @unwatch readonly unwatchedInBase = observable.box(0);
      @watch.ref readonly refInBase = observable.array([1]);

      constructor() {
        makeObservable(this);
      }
    }

    class Derived extends Base {
      @observable derivedField = 0;
      @watch override readonly unwatchedInBase = observable.box(0);
      @watch override readonly refInBase = observable.array([1]);

      constructor() {
        super();
        makeObservable(this);
      }
    }

    test("annotations of both the base class and the subclass are tracked", () => {
      const sample = new Derived();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.baseField = 1;
        sample.derivedField = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set(["baseField", "derivedField"]));
    });

    test("@unwatch in a base class cannot be re-enabled by @watch in a subclass", () => {
      const sample = new Derived();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.unwatchedInBase.set(1);
      });
      expect(watcher.changed).toBe(false);
    });

    test("@watch in a subclass prevails over @watch.ref in a base class, without affecting the base class", () => {
      const derived = new Derived();
      const derivedWatcher = Watcher.get(derived);
      const base = new Base();
      const baseWatcher = Watcher.get(base);

      runInAction(() => {
        derived.refInBase.push(2);
        base.refInBase.push(2);
      });
      expect(derivedWatcher.changedKeys).toEqual(new Set(["refInBase"]));
      expect(baseWatcher.changed).toBe(false);
    });

    test("@unwatch in a subclass disables @watch in a base class, without affecting the base class", () => {
      class WatchedBase {
        @watch readonly box = observable.box(0);
      }
      class UnwatchedDerived extends WatchedBase {
        @unwatch override readonly box = observable.box(0);
      }

      const derived = new UnwatchedDerived();
      const derivedWatcher = Watcher.get(derived);
      const base = new WatchedBase();
      const baseWatcher = Watcher.get(base);

      runInAction(() => {
        derived.box.set(1);
        base.box.set(1);
      });
      expect(derivedWatcher.changed).toBe(false);
      expect(baseWatcher.changedKeys).toEqual(new Set(["box"]));
    });
  });

  describe("@watch on various values", () => {
    class Sample {
      @watch readonly box = observable.box(0);
      @watch readonly plainArrayBox = observable.box([1], { deep: false });
      @watch readonly observableArrayBox = observable.box(observable.array([1]));
      @watch plain = 0;
      @watch private readonly privateBox = observable.box(0);
      @unwatch @observable source = 1;

      constructor() {
        makeObservable(this);
      }

      @watch
      get absolute() {
        return Math.abs(this.source);
      }

      setPrivateBox(value: number) {
        this.privateBox.set(value);
      }
    }

    test("setting a boxed observable is tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.box.set(1);
      });
      expect(watcher.changedKeys).toEqual(new Set(["box"]));
    });

    test("mutations to a plain array in a boxed observable are NOT tracked, but setting the box is", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.plainArrayBox.get().push(2);
      });
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        sample.plainArrayBox.set([1]);
      });
      expect(watcher.changedKeys).toEqual(new Set(["plainArrayBox"]));
    });

    test("mutations to an observable array in a boxed observable are tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.observableArrayBox.get().push(2);
      });
      expect(watcher.changedKeys).toEqual(new Set(["observableArrayBox"]));
    });

    test("assignments to a non-observable field are NOT tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.plain = 1;
      });
      expect(watcher.changed).toBe(false);
    });

    test("TypeScript private fields are tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.setPrivateBox(1);
      });
      expect(watcher.changedKeys).toEqual(new Set(["privateBox"]));
    });

    test("a getter is tracked by its return value", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.source = -1; // Math.abs() stays the same
      });
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        sample.source = 2;
      });
      expect(watcher.changedKeys).toEqual(new Set(["absolute"]));
    });

    test("a key missing from the target is never tracked", () => {
      class Removed {
        @watch readonly box = observable.box(0);

        constructor() {
          Reflect.deleteProperty(this, "box");
        }
      }

      const sample = new Removed();
      const watcher = Watcher.get(sample);
      expect("box" in sample).toBe(false);

      runInAction(() => {
        (sample as any).box = observable.box(1);
      });
      runInAction(() => {
        (sample as any).box.set(2);
      });
      expect(watcher.changed).toBe(false);
    });
  });

  describe("@watch combined with @observable", () => {
    class Sample {
      @watch @observable array = [1];

      constructor() {
        makeObservable(this);
      }
    }

    test("a change is counted once", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.array.push(2);
      });
      expect(watcher.changedKeys).toEqual(new Set(["array"]));
      expect(watcher.changedTick).toBe(1n);
    });
  });

  describe("@watch and @watch.ref on the same key", () => {
    class Sample {
      @watch @watch.ref readonly shallowOuter = observable.array([1]);
      @watch.ref @watch readonly refOuter = observable.array([1]);
    }

    test("the outermost annotation prevails", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.shallowOuter.push(2);
        sample.refOuter.push(2);
      });
      // Decorators are applied from the innermost one, so the outermost is the "last annotation" that prevails.
      expect(watcher.changedKeys).toEqual(new Set(["shallowOuter"]));
    });
  });

  describe("@watch.ref on a boxed observable", () => {
    class Sample {
      @watch.ref readonly box = observable.box(0);
    }

    test("setting the box is NOT tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.box.set(1);
      });
      // As documented on `watch`, @watch.ref opts out of unwrapping boxed observables: the box itself is compared by identity, and a readonly box never changes identity
      expect(watcher.changed).toBe(false);
      expect(watcher.changedTick).toBe(0n);
    });
  });

  describe("@watch.ref combined with @nested", () => {
    class Sample {
      @watch.ref @nested @observable items = [new Leaf()];

      constructor() {
        makeObservable(this);
      }
    }

    test("@watch.ref has no effect: mutations are still tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.items.push(new Leaf());
      });
      expect(watcher.changedKeys).toEqual(new Set(["items"]));
      expect(watcher.changedTick).toBe(1n);
    });
  });

  describe("@unwatch combined with @nested", () => {
    class Sample {
      @unwatch @nested @observable child = new Leaf();

      constructor() {
        makeObservable(this);
      }
    }

    test("reassignments are NOT tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.child = new Leaf();
      });
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
    });

    test("changes to the nested object do not mark the parent as changed, but appear in changedKeyPaths", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const childWatcher = Watcher.get(sample.child);

      runInAction(() => {
        sample.child.value = 1;
      });
      expect(childWatcher.changed).toBe(true);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.nested.get("child" as KeyPath)).toBe(childWatcher);
      // PINNED(bug): @unwatch only skips the reactions, not the nested fetcher, so the nested changes leak into changedKeyPaths while `changed` is false. Expected: an empty set, as @nested is "considered @watched unless @unwatch is specified" (JSDoc of `watch`). Flip this assertion when fixing.
      expect(watcher.changedKeyPaths).toEqual(new Set(["child.value"]));
    });

    test("changes to the nested object are lost until its watcher is created", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.child.value = 1;
      });
      // PINNED(quirk): without the reactions of @nested, the nested watcher is only created on first access, so whether a change shows up in changedKeyPaths depends on who accessed it before. Decide: settle together with the changedKeyPaths leak above.
      expect(watcher.changedKeyPaths).toEqual(new Set());
      expect(Watcher.get(sample.child).changed).toBe(false);
    });

    test("reset() still resets the nested watcher", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const childWatcher = Watcher.get(sample.child);

      runInAction(() => {
        sample.child.value = 1;
      });
      watcher.reset();
      expect(childWatcher.changed).toBe(false);
    });
  });

  describe("symbol keys", () => {
    const observableKey = Symbol("observable");
    const watchedKey = Symbol("watch");
    const unwatchedKey = Symbol("unwatch");
    const nestedKey = Symbol("nested");

    class Sample {
      @observable [observableKey] = 0;
      @watch readonly [watchedKey] = observable.box(0);
      @unwatch @observable [unwatchedKey] = 0;
      @nested readonly [nestedKey] = new Leaf();

      constructor() {
        makeObservable(this);
      }
    }

    test("changes are ignored", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.nested.size).toBe(0);

      runInAction(() => {
        sample[observableKey] = 1;
        sample[watchedKey].set(1);
        sample[unwatchedKey] = 1;
        sample[nestedKey].value = 1;
      });
      // PINNED(quirk): symbol keys are skipped entirely ("not supported" in the source), so changes to them do not even flip `changed`. Decide: should they count toward changed/changedTick without a key, or be rejected when annotated?
      expect(watcher.changed).toBe(false);
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.changedKeyPaths).toEqual(new Set());
    });
  });

  describe("@nested change propagation", () => {
    class Sample {
      @nested @observable child = new Leaf();
      @nested @observable items: Leaf[] = [];

      constructor() {
        makeObservable(this);
      }
    }

    test("the parent's changedTick increments only when a nested watcher becomes changed", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const childWatcher = Watcher.get(sample.child);
      const onTick = vi.fn();
      const dispose = reaction(() => watcher.changedTick, onTick);
      try {
        runInAction(() => {
          sample.child.value = 1;
        });
        expect(childWatcher.changedTick).toBe(1n);
        expect(watcher.changedTick).toBe(1n);
        expect(onTick).toHaveBeenCalledTimes(1);

        runInAction(() => {
          sample.child.value = 2;
        });
        expect(childWatcher.changedTick).toBe(2n);
        // PINNED(bug): the parent only reacts to the nested `changed` flipping to true, so further nested changes neither increment its changedTick nor notify reactions observing it (the autosave/sync use case in the overview of the docs). Expected: 2n and 2 calls. Flip these assertions when fixing.
        expect(watcher.changedTick).toBe(1n);
        expect(onTick).toHaveBeenCalledTimes(1);
      } finally {
        dispose();
      }
    });

    test("the parent's changedTick increments again once the nested watcher is reset and changes again", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const childWatcher = Watcher.get(sample.child);

      runInAction(() => {
        sample.child.value = 1;
      });
      childWatcher.reset();
      expect(watcher.changed).toBe(true);
      expect(watcher.changedTick).toBe(1n);

      runInAction(() => {
        sample.child.value = 2;
      });
      expect(watcher.changedTick).toBe(2n);
    });

    test("adding an object that is already changed counts both the mutation and the nested change", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const leaf = new Leaf();
      Watcher.get(leaf);
      runInAction(() => {
        leaf.value = 1;
      });

      runInAction(() => {
        sample.items.push(leaf);
      });
      expect(watcher.changedTick).toBe(2n);
      expect(watcher.changedKeys).toEqual(new Set(["items"]));
      expect(watcher.changedKeyPaths).toEqual(new Set(["items", "items.0.value"]));
    });

    test("adding an object that is already changed inside unwatch() hides its later changes from the parent", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const leaf = new Leaf();
      Watcher.get(leaf);
      runInAction(() => {
        leaf.value = 1;
      });

      unwatch(() => {
        sample.items.push(leaf);
      });
      expect(watcher.changed).toBe(false);
      expect(watcher.changedTick).toBe(0n);
      // PINNED(quirk): key paths are read from nested watchers directly, so the nested change shows up although the parent is not changed. Decide: should changedKeyPaths be consistent with `changed`?
      expect(watcher.changedKeyPaths).toEqual(new Set(["items.0.value"]));

      runInAction(() => {
        leaf.value = 2;
      });
      expect(Watcher.get(leaf).changedTick).toBe(2n);
      // PINNED(bug): the nested `changed` already flipped to true inside unwatch(), and the parent only reacts to that flip, so a change made outside unwatch() never reaches the parent. Expected: `true`. Flip this assertion when fixing.
      expect(watcher.changed).toBe(false);
    });

    test("key paths follow the current position of nested objects", () => {
      const sample = new Sample();
      runInAction(() => {
        sample.items.push(new Leaf(), new Leaf());
      });
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.items[1].value = 1;
      });
      expect(watcher.changedKeyPaths).toEqual(new Set(["items.1.value"]));

      runInAction(() => {
        sample.items.shift();
      });
      // Key paths are derived from where the changed nested objects are now (as are the dropped/replaced cases below), so the change made at "items.1" is reported at "items.0"
      expect(watcher.changedKeyPaths).toEqual(new Set(["items", "items.0.value"]));
    });

    test("removing a changed object keeps the parent changed but drops its key paths, and reset() does not reach it", () => {
      const sample = new Sample();
      const leaf = new Leaf();
      runInAction(() => {
        sample.items.push(leaf);
      });
      const watcher = Watcher.get(sample);

      runInAction(() => {
        leaf.value = 1;
      });
      runInAction(() => {
        sample.items.pop();
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedTick).toBe(2n);
      expect(watcher.changedKeyPaths).toEqual(new Set(["items"]));

      watcher.reset();
      expect(watcher.changed).toBe(false);
      expect(Watcher.get(leaf).changed).toBe(true);
    });

    test("replacing a changed object drops its key paths", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      const previous = sample.child;

      runInAction(() => {
        sample.child.value = 1;
      });
      runInAction(() => {
        sample.child = new Leaf();
      });
      expect(watcher.changedKeys).toEqual(new Set(["child"]));
      expect(watcher.changedKeyPaths).toEqual(new Set(["child"]));
      expect(watcher.nested.get("child" as KeyPath)).toBe(Watcher.get(sample.child));
      expect(Watcher.get(previous).changed).toBe(true);
    });

    test("assumeChanged() on a nested watcher increments the parent's changedTick", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      Watcher.get(sample.child).assumeChanged();
      expect(Watcher.get(sample.child).changedTick).toBe(0n);
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeyPaths).toEqual(new Set());
      // PINNED(quirk): the parent counts an assumed nested change as a tick, although changedTick is documented as "Not affected by assumeChanged()". Decide: should an assumed change propagate through `changed` only?
      expect(watcher.changedTick).toBe(1n);
    });

    test("objects under symbol keys of a map affect `changed` but are out of reach of reset()", () => {
      const key = Symbol("key");
      class MapSample {
        @nested @observable map = new Map<symbol, Leaf>([[key, new Leaf()]]);

        constructor() {
          makeObservable(this);
        }
      }

      const sample = new MapSample();
      const watcher = Watcher.get(sample);
      const leaf = sample.map.get(key)!;
      expect(watcher.nested.size).toBe(0);

      runInAction(() => {
        leaf.value = 1;
      });
      expect(watcher.changedKeyPaths).toEqual(new Set());
      // PINNED(bug): symbol-keyed entries are skipped by the nested fetcher but not by the change propagation, so they flip `changed`. Expected: `false`, as the docs say "Symbol keys in nested objects are ignored". Flip this assertion when fixing.
      expect(watcher.changed).toBe(true);

      watcher.reset();
      expect(watcher.changed).toBe(false);
      expect(Watcher.get(leaf).changed).toBe(true);

      runInAction(() => {
        leaf.value = 2;
      });
      // PINNED(quirk): as reset() cannot reach the entry, it stays changed and its later changes never reach the parent again. Decide: settle together with the bug above (ignore symbol-keyed entries entirely, or support them).
      expect(watcher.changed).toBe(false);
    });

    test("a watcher created after a nested object has changed does not become changed by its later changes", () => {
      const sample = new Sample();
      const childWatcher = Watcher.get(sample.child);
      runInAction(() => {
        sample.child.value = 1;
      });

      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      // PINNED(quirk): key paths are read from nested watchers directly, so the change made before the parent watcher existed shows up although the parent is not changed. Decide: should changedKeyPaths be consistent with `changed`?
      expect(watcher.changedKeyPaths).toEqual(new Set(["child.value"]));

      runInAction(() => {
        sample.child.value = 2;
      });
      expect(childWatcher.changedTick).toBe(2n);
      // PINNED(bug): the nested `changed` was already true when the parent's reaction took its first reading, and the parent only reacts to it flipping, so a change made after the parent watcher was created never reaches it. Expected: `true` ("Watching starts immediately when the Watcher instance is created"). Flip this assertion when fixing.
      expect(watcher.changed).toBe(false);

      childWatcher.reset();
      runInAction(() => {
        sample.child.value = 3;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedTick).toBe(1n);
    });

    test("an object added while another nested object is changed is watched from the moment it is added", () => {
      const sample = new Sample();
      runInAction(() => {
        sample.items.push(new Leaf());
      });
      const watcher = Watcher.get(sample);
      runInAction(() => {
        sample.items[0].value = 1;
      });

      const added = new Leaf();
      runInAction(() => {
        sample.items.push(added);
      });
      runInAction(() => {
        added.value = 1;
      });
      // Only the parent's reactions have seen `added` so far, so this is true only if they created its watcher
      expect(Watcher.get(added).changed).toBe(true);
      expect(watcher.changedKeyPaths).toEqual(new Set(["items", "items.0.value", "items.1.value"]));
    });
  });

  describe("changes reverted within a transaction", () => {
    class Sample {
      @observable value = 0;
      @observable array = [1];
      @observable set = new Set([1]);
      @observable map = new Map([["a", 1]]);

      constructor() {
        makeObservable(this);
      }
    }

    test("a scalar property is NOT tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.value = 1;
        sample.value = 0;
      });
      expect(watcher.changed).toBe(false);
    });

    test.each<[key: string, mutate: (sample: Sample) => void]>([
      [
        "array",
        (s) => {
          s.array.push(2);
          s.array.pop();
        },
      ],
      [
        "set",
        (s) => {
          s.set.add(2);
          s.set.delete(2);
        },
      ],
      [
        "map",
        (s) => {
          s.map.set("a", 2);
          s.map.set("a", 1);
        },
      ],
    ])("a collection is tracked: %s", (key, mutate) => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => mutate(sample));
      // PINNED(quirk): shallow watching compares fresh copies by identity (see "replacing the contents of an array with identical elements is tracked"), so a collection whose contents end up the same still counts as changed. Decide: should shallow watching compare the copies with comparer.shallow?
      expect(watcher.changedKeys).toEqual(new Set([key]));
    });
  });

  describe("@computed errors", () => {
    class Sample {
      @observable fail = true;

      constructor() {
        makeObservable(this);
      }

      @computed
      get risky() {
        if (this.fail) throw new Error("risky");
        return 1;
      }
    }

    test("a @computed that throws when the watcher is created is counted as changed once it recovers", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(consoleError).toHaveBeenCalled();
        expect(watcher.changed).toBe(false);

        runInAction(() => {
          sample.fail = false;
        });
        expect(watcher.changedKeys.has("fail" as KeyPath)).toBe(true);
        // PINNED(quirk): the reaction has no previous value after its first reading threw, so the recovered value counts as a change (while a value-to-error transition does not, see "an error thrown by a @computed is reported by MobX"). Decide: should an error-to-value transition count as a change?
        expect(watcher.changedKeys.has("risky" as KeyPath)).toBe(true);
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("@nested with a frozen object", () => {
    class Sample {
      @nested @observable.ref child: object = Object.freeze({ value: 0 });

      constructor() {
        makeObservable(this);
      }
    }

    test("nested, changedKeyPaths and reset() throw", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const watcher = Watcher.get(new Sample());
        // The change propagation reaction fails on its first run, which MobX reports
        expect(consoleError).toHaveBeenCalled();

        // PINNED(bug): nested watchers are created with Watcher.getSafe(), which throws for non-extensible objects (see ".getSafe"), so a model holding a frozen plain object (e.g. Immer output) under @nested cannot even be reset(), although @nested "supports objects" (docs). Expected: none of them throws (the frozen object is either skipped or given a watcher). Flip these assertions to `.not.toThrow()` when fixing.
        expect(() => watcher.nested).toThrowError(/not extensible/);
        expect(() => watcher.changedKeyPaths).toThrowError(/not extensible/);
        expect(() => watcher.reset()).toThrowError(/not extensible/);
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("@nested reference cycles", () => {
    class Node {
      @observable value = 0;
      @nested @observable other: Node | null = null;

      constructor() {
        makeObservable(this);
      }
    }

    test("Watcher.get() throws on the first call, and the watchers cached meanwhile work", () => {
      const a = new Node();
      const b = new Node();
      const self = new Node();
      runInAction(() => {
        a.other = b;
        b.other = a;
        self.other = self;
      });

      // PINNED(quirk): building the reactions of a's watcher creates b's watcher, which creates and caches a second watcher for `a` before the first one is cached, so caching the first one throws (a self-reference too). Decide: support cycles (e.g. cache the watcher before building its reactions), or detect them with a clear error?
      expect(() => Watcher.get(a)).toThrowError(/Cannot redefine property/);
      expect(() => Watcher.get(self)).toThrowError(/Cannot redefine property/);

      const aWatcher = Watcher.get(a);
      const bWatcher = Watcher.get(b);
      expect(aWatcher.nested.get("other" as KeyPath)).toBe(bWatcher);
      expect(bWatcher.nested.get("other" as KeyPath)).toBe(aWatcher);

      runInAction(() => {
        b.value = 1;
      });
      expect(bWatcher.changed).toBe(true);
      expect(aWatcher.changed).toBe(true);
    });

    test("changedKeyPaths throws a cycle error when the watchers are created in a transaction", () => {
      const a = new Node();
      const b = new Node();
      let watcher!: Watcher;
      runInAction(() => {
        a.other = b;
        b.other = a;
        watcher = Watcher.get(a);
      });
      expect(Watcher.get(b).nested.get("other" as KeyPath)).toBe(watcher);

      runInAction(() => {
        b.value = 1;
      });
      expect(watcher.changed).toBe(true);
      // PINNED(quirk): key paths are collected recursively without cycle detection, so MobX reports a cycle (and reset() recurses until the stack overflows, which is not exercised here). Decide: support cycles by tracking visited watchers, or reject them?
      expect(() => watcher.changedKeyPaths).toThrowError(/Cycle detected/);
    });
  });
});

describe("Types", () => {
  test("Watcher", () => {
    const watcher = Watcher.get({});
    expectTypeOf(watcher).toEqualTypeOf<Watcher>();
    expectTypeOf(Watcher.getSafe({})).toEqualTypeOf<Watcher | null>();
    expectTypeOf(Watcher.isWatching).toEqualTypeOf<boolean>();
    expectTypeOf(watcher.id).toEqualTypeOf<string>();
    expectTypeOf(watcher.changed).toEqualTypeOf<boolean>();
    expectTypeOf(watcher.changedTick).toEqualTypeOf<bigint>();
    expectTypeOf(watcher.changedKeys).toEqualTypeOf<ReadonlySet<KeyPath>>();
    expectTypeOf(watcher.changedKeyPaths).toEqualTypeOf<ReadonlySet<KeyPath>>();
    expectTypeOf(watcher.nested).toEqualTypeOf<ReadonlyMap<KeyPath, Watcher>>();
    expectTypeOf(watcher.reset).returns.toBeVoid();
    expectTypeOf(watcher.assumeChanged).returns.toBeVoid();
  });

  test("misuse is rejected at compile time", () => {
    const assertions = (watcher: Watcher) => {
      // @ts-expect-error: the target must be an object
      Watcher.get(1);
      // @ts-expect-error: the constructor is private
      new Watcher();
      // @ts-expect-error: id is read-only
      watcher.id = "id";
      // @ts-expect-error: changed has no setter
      watcher.changed = true;
      // @ts-expect-error: changedKeys is read-only
      watcher.changedKeys.add("key" as KeyPath);
      // @ts-expect-error: changedTick has no setter
      watcher.changedTick = 1n;
      // @ts-expect-error: nested is read-only
      watcher.nested.delete("key" as KeyPath);
      // @ts-expect-error: unwatch() takes a function
      unwatch(1);
    };
    expectTypeOf(assertions).parameter(0).toEqualTypeOf<Watcher>();
  });

  test("watch", () => {
    expect(Object.isFrozen(watch)).toBe(true);
    expectTypeOf(watch).toBeFunction();
    expectTypeOf(watch.ref).toBeFunction();
  });

  test("unwatch", () => {
    expectTypeOf(unwatch).toBeCallableWith(() => {});
    expectTypeOf(unwatch(() => {})).toBeVoid();
  });

  test("Watcher.get() accepts functions at compile time, but throws at runtime", () => {
    // PINNED(quirk): functions satisfy `T extends object`, so `Watcher.get(() => {})` type-checks although it throws a TypeError (see ".get"). Decide: should the signature exclude functions (this would become a @ts-expect-error), or should functions be accepted as targets?
    expectTypeOf(Watcher.get<() => void>).toBeCallableWith(() => {});
    expect(() => Watcher.get(() => {})).toThrowError(TypeError);
  });
});
