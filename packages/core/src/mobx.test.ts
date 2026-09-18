/**
 * Test cases for undocumented/unclear behaviors of MobX that are essential for the library
 */

import {
  $mobx,
  observable,
  reaction,
  runInAction,
  computed,
  makeObservable,
  action,
  autorun,
  configure,
  getAtom,
  isAction,
  isBoxedObservable,
  isComputedProp,
  isObservableArray,
  isObservableMap,
  isObservableObject,
  isObservableProp,
  isObservableSet,
  remove,
  set,
  untracked,
} from "mobx";

/** Read the value of an annotated key through its atom */
function readAtom(target: object, key: PropertyKey) {
  return (getAtom(target, key) as unknown as { get(): unknown }).get();
}

describe("MobX", () => {
  describe("builds", () => {
    test("NODE_ENV=production loads the production build, which mangles the internal names ending in _", () => {
      // What the mobx-production project in vitest.config.mts relies on to test against that build
      const adm = (observable({}) as any)[$mobx];
      expect("values_" in adm).toBe(process.env.NODE_ENV !== "production");
    });
  });

  // getMobxObservableAnnotations and isMobxComputedAnnotation go through these, as its production build mangles the
  // internal API
  describe("introspection of observable objects", () => {
    class Sample {
      @observable field1 = 123;
      @observable.ref field2 = 456;

      constructor() {
        makeObservable(this);
      }

      @computed get computed1() {
        return this.field1 * 2;
      }
      @computed.struct get computed2() {
        return this.field2 * 3;
      }

      // biome-ignore lint/plugin/mobxUnboundParameterlessAction: models may declare actions as methods, which must not count as observable props
      @action action1() {}
    }

    test("isObservableProp is true for the keys of observable and computed annotations only", () => {
      const obj = new Sample();

      expect(isObservableProp(obj, "field1")).toBe(true);
      expect(isObservableProp(obj, "field2")).toBe(true);
      expect(isObservableProp(obj, "computed1")).toBe(true);
      expect(isObservableProp(obj, "computed2")).toBe(true);
      expect(isObservableProp(obj, "action1")).toBe(false);
      expect(isObservableProp(obj, "missing")).toBe(false);
    });

    test("isComputedProp is true for the keys of computed annotations only", () => {
      const obj = new Sample();

      expect(isComputedProp(obj, "computed1")).toBe(true);
      expect(isComputedProp(obj, "computed2")).toBe(true);
      expect(isComputedProp(obj, "field1")).toBe(false);
      expect(isComputedProp(obj, "field2")).toBe(false);
      expect(isComputedProp(obj, "action1")).toBe(false);
      expect(isComputedProp(obj, "missing")).toBe(false);
    });

    test("getAtom returns the atom holding the current value of an annotated key, and reads through it are tracked", () => {
      const obj = new Sample();
      expect(readAtom(obj, "field1")).toBe(123);
      expect(readAtom(obj, "computed1")).toBe(246);

      const effectFn = vi.fn();
      const dispose = reaction(() => readAtom(obj, "computed1"), effectFn);
      runInAction(() => (obj.field1 = 1));
      expect(readAtom(obj, "field1")).toBe(1);
      expect(effectFn).toBeCalledTimes(1);
      expect(effectFn).lastCalledWith(2, 246, expect.anything());

      dispose();
    });

    test("getAtom throws for keys that are not annotated, and for the falsy keys '' and 0 even when they are", () => {
      const obj = observable<Record<string | number, number>>({ "": 1 });
      runInAction(() => set(obj, 0, 2));

      expect(isObservableProp(obj, "")).toBe(true);
      expect(isObservableProp(obj, 0)).toBe(true);
      expect(() => getAtom(obj, "")).toThrow();
      expect(() => getAtom(obj, 0)).toThrow();
      expect(() => getAtom(obj, "missing")).toThrow();
    });

    test("isComputedProp goes through getAtom, so it throws for the falsy keys '' and 0 when they are annotated", () => {
      const obj = observable<Record<string | number, number>>({ "": 1 });
      runInAction(() => set(obj, 0, 2));

      expect(() => isComputedProp(obj, "")).toThrow();
      expect(() => isComputedProp(obj, 0)).toThrow();
      expect(isComputedProp(observable({}), "")).toBe(false);
    });

    test("removing a key leaves its atom detached, holding the last value", () => {
      const obj = observable<Record<string, number>>({ value: 1 });
      const atom = getAtom(obj, "value") as unknown as { get(): unknown };

      runInAction(() => remove(obj, "value"));
      expect(isObservableProp(obj, "value")).toBe(false);
      expect("value" in obj).toBe(false);
      expect(atom.get()).toBe(1);
    });

    test("a property deleted from a non-proxied target without MobX stays annotated", () => {
      const obj: Record<string, number> = observable({ value: 1 }, {}, { proxy: false });

      delete obj.value;
      expect("value" in obj).toBe(false);
      expect(isObservableProp(obj, "value")).toBe(true);
      expect(readAtom(obj, "value")).toBe(1);
    });

    test("the administration holds the annotated keys as keys of maps among its own enumerable properties", () => {
      // getMobxObservableAnnotations finds keys that are not properties this way, whatever the (mangled) names
      const keysInMaps = (target: object) =>
        Object.values((target as any)[$mobx]).flatMap((value) => (value instanceof Map ? [...value.keys()] : []));

      expect(keysInMaps(new Sample())).toEqual(expect.arrayContaining(["field1", "field2", "computed1", "computed2"]));

      const obj: Record<string, number> = observable({ value: 1 }, {}, { proxy: false });
      delete obj.value;
      expect(keysInMaps(obj)).toContain("value");
    });

    test("listing the keys of a proxied observable object is tracked, unless untracked", () => {
      const obj = observable<Record<string, number>>({ value: 1 });
      const trackedFn = vi.fn();
      const untrackedFn = vi.fn();
      const dispose1 = autorun(() => trackedFn(Reflect.ownKeys(obj)));
      const dispose2 = autorun(() => untrackedFn(untracked(() => Reflect.ownKeys(obj))));

      runInAction(() => (obj.added = 2));
      expect(trackedFn).toBeCalledTimes(2);
      expect(untrackedFn).toBeCalledTimes(1);

      dispose1();
      dispose2();
    });

    test("observable() stores function-valued properties as observable values holding actions", () => {
      const obj = observable({
        method() {
          return 1;
        },
      });

      expect(isObservableProp(obj, "method")).toBe(true);
      expect(isAction(obj.method)).toBe(true);
    });
  });

  describe("type predicates", () => {
    test("isObservableObject is true only for observable objects", () => {
      class Plain {
        field = 1;
      }

      expect(isObservableObject(observable({}))).toBe(true);
      expect(isObservableObject(observable({}, {}, { proxy: false }))).toBe(true);
      expect(isObservableObject(new Plain())).toBe(false);
      expect(isObservableObject({})).toBe(false);
      expect(isObservableObject(observable.array())).toBe(false);
      expect(isObservableObject(observable.set())).toBe(false);
      expect(isObservableObject(observable.map())).toBe(false);
      expect(isObservableObject(observable.box({}))).toBe(false);
      expect(isObservableObject(computed(() => ({})))).toBe(false);
      expect(isObservableObject(null)).toBe(false);
      expect(isObservableObject(undefined)).toBe(false);
    });

    test("isBoxedObservable is true for boxed observables but not for computed values", () => {
      expect(isBoxedObservable(observable.box(1))).toBe(true);
      expect(isBoxedObservable(computed(() => 1))).toBe(false);
      expect(isBoxedObservable(observable({ value: 1 }))).toBe(false);
    });

    test("collection predicates are false for plain collections", () => {
      expect(isObservableArray([])).toBe(false);
      expect(isObservableSet(new Set())).toBe(false);
      expect(isObservableMap(new Map())).toBe(false);
    });

    test("isObservableObject is true for objects inheriting from an observable object", () => {
      const child = Object.create(observable({ value: 1 }));
      expect(Object.hasOwn(child, $mobx)).toBe(false);
      expect(isObservableObject(child)).toBe(true);
    });

    test("non-proxied (legacy) observable arrays are not Array.isArray, but are observable arrays", () => {
      configure({ useProxies: "never" });
      try {
        const arr = observable.array([1, 2]);
        expect(Array.isArray(arr)).toBe(false);
        expect(isObservableArray(arr)).toBe(true);
        expect([...arr]).toEqual([1, 2]);
      } finally {
        configure({ useProxies: "always" }); // The default
      }
      expect(Array.isArray(observable.array())).toBe(true);
    });

    test("observable collections are not instances of the built-in collections, except arrays", () => {
      expect(Array.isArray(observable.array())).toBe(true);
      expect(observable.set() instanceof Set).toBe(false);
      expect(observable.map() instanceof Map).toBe(false);
    });

    test("deep boxed observables convert collections into observable ones, but non-deep ones do not", () => {
      expect(isObservableArray(observable.box([1]).get())).toBe(true);
      expect(isObservableSet(observable.box(new Set([1])).get())).toBe(true);
      expect(isObservableMap(observable.box(new Map([["key", 1]])).get())).toBe(true);

      const arr = [1];
      expect(observable.box(arr, { deep: false }).get()).toBe(arr);
    });
  });

  describe("reaction()", () => {
    describe("scheduler / delay", () => {
      test("delayed scheduler affects on both observing expression and effect", async () => {
        const obj = observable({ expr: 0, effect: 0 });
        const exprFn = vi.fn(() => {
          return obj.expr;
        });
        const effectFn = vi.fn((value: number) => {
          obj.effect = value;
        });

        reaction(exprFn, effectFn, {
          delay: 100,
        });
        for (let i = 0; i < 10; i++) {
          runInAction(() => obj.expr++);
        }

        await vi.waitFor(() => expect(obj.effect).toBe(obj.expr));
        expect(exprFn).toBeCalledTimes(2);
        expect(exprFn).nthReturnedWith(1, 0);
        expect(exprFn).nthReturnedWith(2, 10);
        expect(effectFn).toBeCalledTimes(1);
        expect(effectFn).lastCalledWith(10, 0, expect.anything());
      });

      test("delayed scheduler acts as a throttle", async () => {
        const obj = observable({ expr: 0, effect: 0 });
        const exprFn = vi.fn(() => {
          return obj.expr;
        });
        const effectFn = vi.fn((value: number) => {
          obj.effect = value;
        });

        reaction(exprFn, effectFn, {
          delay: 150,
        });
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50)); // Adds up to 250ms at the end
          runInAction(() => obj.expr++);
        }

        await vi.waitFor(() => expect(obj.effect).toBe(obj.expr));
        expect(exprFn).toBeCalledTimes(3); // If it's debounced, it should be 2
        expect(exprFn).nthReturnedWith(1, 0);
        expect(exprFn).nthReturnedWith(2, 3);
        expect(effectFn).toBeCalledTimes(2); // If it's debounced, it should be 1
        expect(effectFn).nthCalledWith(1, 3, 0, expect.anything());
        expect(effectFn).nthCalledWith(2, 5, 3, expect.anything());
      });

      test("scheduler will not be called when the previous scheduler is still running", async () => {
        const obj = observable({ expr: 0, effect: 0 });
        const exprFn = vi.fn(() => {
          return obj.expr;
        });
        const effectFn = vi.fn((value: number) => {
          obj.effect = value;
        });

        let schedulerCallCount = 0;
        reaction(exprFn, effectFn, {
          scheduler: (fn) => {
            schedulerCallCount++;
            // clearTimeout is meaningless
            setTimeout(fn, 100);
          },
        });
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 10)); // Adds up to 50ms at the end
          runInAction(() => obj.expr++);
        }

        await vi.waitFor(() => expect(obj.effect).toBe(obj.expr));
        expect(schedulerCallCount).toBe(1);
      });
    });

    describe("boxed observables", () => {
      test("changes to the content are not observed on the boxed observable itself", () => {
        const obj = observable.box(0);
        const effectFn = vi.fn();
        reaction(() => obj, effectFn);

        // Update the content
        runInAction(() => obj.set(1));
        expect(effectFn).toBeCalledTimes(0);
      });

      test("changes to the content can be observed by reading it", () => {
        const obj = observable.box(0);
        const effectFn = vi.fn();
        reaction(() => obj.get(), effectFn);

        // Update the content
        runInAction(() => obj.set(1));
        expect(effectFn).toBeCalledTimes(1);
      });
    });

    describe("observable objects", () => {
      test("changes to entries are not observed on the object itself", () => {
        const obj: Record<string, number> = observable({ value: 0 });
        const effectFn = vi.fn();
        reaction(() => obj, effectFn);

        // Update existing property
        runInAction(() => obj.value++);
        expect(effectFn).toBeCalledTimes(0);

        // Add new property
        runInAction(() => (obj.other = 0));
        expect(effectFn).toBeCalledTimes(0);
      });

      test("changes to entries can be observed by reading them", () => {
        const obj: Record<string, number> = observable({ value: 0 });
        const effectFn = vi.fn();
        reaction(() => Object.entries(obj), effectFn);

        // Update existing property
        runInAction(() => obj.value++);
        expect(effectFn).toBeCalledTimes(1);

        // Add new property
        runInAction(() => (obj.other = 0));
        expect(effectFn).toBeCalledTimes(2);
      });
    });

    describe("observable arrays", () => {
      test("changes to elements are not observed on the array itself", () => {
        const arr = observable.array([0]);
        const effectFn = vi.fn();
        reaction(() => arr, effectFn);

        // Update existing element
        runInAction(() => (arr[0] = 1));
        expect(effectFn).toBeCalledTimes(0);

        // Add new element
        runInAction(() => arr.push(2));
        expect(effectFn).toBeCalledTimes(0);
      });

      test("changes to elements can be observed by creating shallow copy", () => {
        const arr = observable.array([0]);
        const effectFn = vi.fn();
        reaction(() => arr.slice(), effectFn);

        // Update existing element
        runInAction(() => (arr[0] = 1));
        expect(effectFn).toBeCalledTimes(1);

        // Add new element
        runInAction(() => arr.push(2));
        expect(effectFn).toBeCalledTimes(2);
      });
    });

    describe("observable sets", () => {
      test("changes to values are not observed on the set itself", () => {
        const set = observable.set([0]);
        const effectFn = vi.fn();
        reaction(() => set, effectFn);

        // Add new element
        runInAction(() => set.add(2));
        expect(effectFn).toBeCalledTimes(0);
      });

      test("changes to values can be observed by creating shallow copy", () => {
        const set = observable.set([0]);
        const effectFn = vi.fn();
        reaction(() => new Set(set), effectFn);

        // Add new element
        runInAction(() => set.add(2));
        expect(effectFn).toBeCalledTimes(1);
      });
    });

    describe("observable maps", () => {
      test("changes to entries are not observed on the map itself", () => {
        const map = observable.map([["key", 0]]);
        const effectFn = vi.fn();
        reaction(() => map, effectFn);

        // Update existing key
        runInAction(() => map.set("key", 1));
        expect(effectFn).toBeCalledTimes(0);

        // Add new key
        runInAction(() => map.set("other", 0));
        expect(effectFn).toBeCalledTimes(0);
      });

      test("changes to entries can be observed by creating shallow copy", () => {
        const map = observable.map([["key", 0]]);
        const effectFn = vi.fn();
        reaction(() => new Map(map), effectFn);

        // Update existing key
        runInAction(() => map.set("key", 1));
        expect(effectFn).toBeCalledTimes(1);

        // Add new key
        runInAction(() => map.set("other", 0));
        expect(effectFn).toBeCalledTimes(2);
      });
    });
  });
});
