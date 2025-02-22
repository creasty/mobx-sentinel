/**
 * Test cases for undocumented/unclear behaviors of MobX that are essential for the library
 */

import { $mobx, observable, reaction, runInAction, computed, makeObservable } from "mobx";
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
          delay: 100,
        });
        for (let i = 0; i < 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          runInAction(() => obj.expr++);
        }

        await vi.waitFor(() => expect(obj.effect).toBe(obj.expr));
        expect(exprFn).toBeCalledTimes(3); // If it's debounced, it should be 2
        expect(exprFn).nthReturnedWith(1, 0);
        expect(exprFn).nthReturnedWith(2, 5);
        expect(effectFn).toBeCalledTimes(2); // If it's debounced, it should be 1
        expect(effectFn).nthCalledWith(1, 5, 0, expect.anything());
        expect(effectFn).nthCalledWith(2, 10, 5, expect.anything());
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
