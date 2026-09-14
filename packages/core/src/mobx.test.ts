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
  isAction,
  isBoxedObservable,
  isObservableArray,
  isObservableMap,
  isObservableObject,
  isObservableProp,
  isObservableSet,
  makeAutoObservable,
  remove,
} from "mobx";
import type { ObservableObjectAdministration } from "mobx/dist/internal";

describe("MobX", () => {
  describe("$mobx and ObservableObjectAdministration", () => {
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
    }

    test("List of annotated properties can be retrieved via the internal API", () => {
      const obj = new Sample();
      const adm = (obj as any)[$mobx] as ObservableObjectAdministration;

      expectTypeOf(adm).toMatchTypeOf<{
        values_: Map<string | symbol | number, { get: () => any }>;
      }>();

      expect(adm).toBeTruthy();
      expect(adm).toBeTypeOf("object");
      expect(adm).toHaveProperty("values_");
      expect(adm.values_).toBeInstanceOf(Map);

      for (const [key, value] of adm.values_) {
        expect(key).toBeTypeOf("string");
        expect(value).toBeTruthy();
        expect(value).toBeTypeOf("object");
        expect(value).toHaveProperty("get");
        expect(value.get).toBeTypeOf("function");
      }

      expect(new Set(adm.values_.keys())).toEqual(new Set(["field1", "field2", "computed1", "computed2"]));
      expect(adm.values_.get("field1")?.get()).toEqual(obj.field1);
      expect(adm.values_.get("field2")?.get()).toEqual(obj.field2);
      expect(adm.values_.get("computed1")?.get()).toEqual(obj.computed1);
      expect(adm.values_.get("computed2")?.get()).toEqual(obj.computed2);
    });

    test("getObservablePropValue_ reads the current value of an annotated key", () => {
      const obj = new Sample();
      const adm = (obj as any)[$mobx];

      expectTypeOf<ObservableObjectAdministration["getObservablePropValue_"]>().toEqualTypeOf<
        (key: PropertyKey) => any
      >();
      expect(adm.getObservablePropValue_).toBeTypeOf("function");
      expect(adm.getObservablePropValue_("field1")).toBe(123);
      expect(adm.getObservablePropValue_("computed1")).toBe(246);

      runInAction(() => (obj.field1 = 1));
      expect(adm.getObservablePropValue_("field1")).toBe(1);
      expect(adm.getObservablePropValue_("computed1")).toBe(2);
    });

    test("getObservablePropValue_ throws for keys that are not annotated", () => {
      const obj = new Sample();
      const adm = (obj as any)[$mobx];

      expect(() => adm.getObservablePropValue_("missing")).toThrow(TypeError);
    });

    test("reads through getObservablePropValue_ are tracked by reactions", () => {
      const obj = new Sample();
      const adm = (obj as any)[$mobx];
      const effectFn = vi.fn();
      reaction(() => adm.getObservablePropValue_("computed1"), effectFn);

      runInAction(() => (obj.field1 = 1));
      expect(effectFn).toBeCalledTimes(1);
      expect(effectFn).lastCalledWith(2, 246, expect.anything());
    });

    test("lazy key maps are not populated without stage-3 decorators", () => {
      class AnnotationMap {
        field1 = 1;
        constructor() {
          makeObservable(this, { field1: observable, computed1: computed });
        }
        get computed1() {
          return this.field1;
        }
      }
      class Auto {
        field1 = 1;
        constructor() {
          makeAutoObservable(this);
        }
        get computed1() {
          return this.field1;
        }
      }

      const targets: [object, string[]][] = [
        [new Sample(), ["field1", "field2", "computed1", "computed2"]],
        [new AnnotationMap(), ["field1", "computed1"]],
        [new Auto(), ["field1", "computed1"]],
        [observable({ field1: 1 }), ["field1"]],
      ];
      for (const [target, keys] of targets) {
        const adm = (target as any)[$mobx];
        // The fields are undefined both on MobX versions that lack them (<6.16) and on those that initialize them lazily
        expect(adm.lazyObservableKeys_).toBeUndefined();
        expect(adm.lazyComputedKeys_).toBeUndefined();
        // All annotations are materialized up front, before any property is read
        expect(new Set(adm.values_.keys())).toEqual(new Set(keys));
      }
    });

    test("observable() stores function-valued properties as observable values holding actions", () => {
      const obj = observable({
        method() {
          return 1;
        },
      });
      const adm = (obj as any)[$mobx] as ObservableObjectAdministration;

      expect(isObservableProp(obj, "method")).toBe(true);
      expect(isAction(obj.method)).toBe(true);
      expect(adm.values_.has("method")).toBe(true);
    });

    test("methods annotated with actions are not stored in values_", () => {
      class Sample {
        field1 = 1;
        constructor() {
          makeObservable(this, { field1: observable, action1: action });
        }
        action1() {}
      }
      const adm = (new Sample() as any)[$mobx] as ObservableObjectAdministration;

      expect([...adm.values_.keys()]).toEqual(["field1"]);
    });

    test("removing a key deletes its values_ entry, while the detached entry keeps the last value", () => {
      const obj = observable<Record<string, number>>({ value: 1 });
      const adm = (obj as any)[$mobx] as ObservableObjectAdministration;
      const entry = adm.values_.get("value")!;

      runInAction(() => remove(obj, "value"));
      expect(adm.values_.has("value")).toBe(false);
      expect("value" in obj).toBe(false);
      expect(entry.get()).toBe(1);
    });

    test("values_ keeps entries whose property was deleted from a non-proxied target without MobX", () => {
      const obj: Record<string, number> = observable({ value: 1 }, {}, { proxy: false });
      const adm = (obj as any)[$mobx] as ObservableObjectAdministration;

      delete obj.value;
      expect("value" in obj).toBe(false);
      expect(adm.values_.has("value")).toBe(true);
      expect(adm.values_.get("value")!.get()).toBe(1);
    });

    test("iterating values_ is not tracked by reactions", () => {
      const obj = observable<Record<string, number>>({ value: 1 });
      const adm = (obj as any)[$mobx] as ObservableObjectAdministration;
      const effectFn = vi.fn();
      const dispose = autorun(() => effectFn([...adm.values_.keys()]));

      runInAction(() => (obj.other = 2));
      expect(effectFn).toBeCalledTimes(1);
      expect([...adm.values_.keys()]).toEqual(["value", "other"]);

      dispose();
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
