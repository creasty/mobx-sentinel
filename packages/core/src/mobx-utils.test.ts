import {
  observable,
  reaction,
  runInAction,
  makeObservable,
  computed,
  action,
  autorun,
  comparer,
  configure,
  extendObservable,
  flow,
  isObservableArray,
  isObservableMap,
  isObservableSet,
  makeAutoObservable,
  override,
  remove,
  set,
  $mobx,
} from "mobx";
import { getMobxObservableAnnotations, shallowReadValue, unwrapShallowContents } from "./mobx-utils";

/** Create observables with `useProxies: "never"`, which makes observable arrays non-proxied (legacy) arrays */
function withLegacyArrays<T>(fn: () => T): T {
  configure({ useProxies: "never" });
  try {
    return fn();
  } finally {
    configure({ useProxies: "always" }); // The default
  }
}

describe("shallowReadValue", () => {
  test("changes to the content of boxed observables can be observed", () => {
    const obj = observable.box(0);
    const effectFn = vi.fn();
    reaction(() => shallowReadValue(obj), effectFn);

    // Update the content
    runInAction(() => obj.set(1));
    expect(effectFn).toBeCalledTimes(1);
  });

  test("changes to entries of observable objects CANNOT be observed", () => {
    const obj: Record<string, number> = observable({ value: 0 });
    const effectFn = vi.fn();
    reaction(() => shallowReadValue(obj), effectFn);

    // Update existing property
    runInAction(() => obj.value++);
    expect(effectFn).toBeCalledTimes(0);

    // Add new property
    runInAction(() => (obj.other = 0));
    expect(effectFn).toBeCalledTimes(0);
  });

  test("changes to elements of observable arrays can be observed", () => {
    const arr = observable.array([0]);
    const effectFn = vi.fn();
    reaction(() => shallowReadValue(arr), effectFn);

    // Update existing element
    runInAction(() => (arr[0] = 1));
    expect(effectFn).toBeCalledTimes(1);

    // Add new element
    runInAction(() => arr.push(2));
    expect(effectFn).toBeCalledTimes(2);
  });

  test("changes to values of observable sets can be observed", () => {
    const set = observable.set([0]);
    const effectFn = vi.fn();
    reaction(() => shallowReadValue(set), effectFn);

    // Add new element
    runInAction(() => set.add(2));
    expect(effectFn).toBeCalledTimes(1);
  });

  test("changes to entries of observable maps can be observed", () => {
    const map = observable.map([["key", 0]]);
    const effectFn = vi.fn();
    reaction(() => shallowReadValue(map), effectFn);

    // Update existing key
    runInAction(() => map.set("key", 1));
    expect(effectFn).toBeCalledTimes(1);

    // Add new key
    runInAction(() => map.set("other", 0));
    expect(effectFn).toBeCalledTimes(2);
  });

  test("signature", () => {
    expectTypeOf(shallowReadValue).parameter(0).toBeAny();
    expectTypeOf(shallowReadValue).returns.toBeAny();
  });

  describe("return value", () => {
    test.each<[string, unknown]>([
      ["undefined", undefined],
      ["null", null],
      ["a number", 1],
      ["a string", "str"],
      ["a boolean", false],
      ["a symbol", Symbol("sym")],
      ["a function", () => {}],
    ])("returns %s as-is", (_, value) => {
      expect(shallowReadValue(value)).toBe(value);
    });

    test("returns non-observable objects and collections as the same reference", () => {
      const values = [{ value: 0 }, [1, 2], new Set([1]), new Map([["key", 1]]), new Date(0)];
      for (const value of values) {
        expect(shallowReadValue(value)).toBe(value);
      }
    });

    test("returns observable objects as the same reference", () => {
      const obj = observable({ value: 0 });
      expect(shallowReadValue(obj)).toBe(obj);
    });

    test("copies observable arrays into a new plain array on every read", () => {
      const element = { value: 0 };
      const arr = observable.array([element, 2], { deep: false });

      const result = shallowReadValue(arr);
      expect(result).not.toBe(arr);
      expect(Array.isArray(result)).toBe(true);
      expect(isObservableArray(result)).toBe(false);
      expect(result).toEqual([element, 2]);
      expect(result[0]).toBe(element); // Shallow: elements are not copied

      expect(shallowReadValue(arr)).not.toBe(result);
    });

    test("copies observable sets into a new plain set on every read", () => {
      const element = { value: 0 };
      const set = observable.set([element, 2], { deep: false });

      const result = shallowReadValue(set);
      expect(result).not.toBe(set);
      expect(result).toBeInstanceOf(Set);
      expect(isObservableSet(result)).toBe(false);
      expect([...result]).toEqual([element, 2]);
      expect([...result][0]).toBe(element); // Shallow: values are not copied

      expect(shallowReadValue(set)).not.toBe(result);
    });

    test("copies observable maps into a new plain map on every read", () => {
      const element = { value: 0 };
      const map = observable.map<string, unknown>(
        [
          ["key1", element],
          ["key2", 2],
        ],
        { deep: false }
      );

      const result = shallowReadValue(map);
      expect(result).not.toBe(map);
      expect(result).toBeInstanceOf(Map);
      expect(isObservableMap(result)).toBe(false);
      expect([...result]).toEqual([
        ["key1", element],
        ["key2", 2],
      ]);
      expect(result.get("key1")).toBe(element); // Shallow: values are not copied

      expect(shallowReadValue(map)).not.toBe(result);
    });

    test("unwraps boxed observables to their content", () => {
      const content = { value: 0 };
      const box = observable.box(content, { deep: false });
      expect(shallowReadValue(box)).toBe(content);
    });

    test("unwraps boxed observables and copies the observable collection they hold", () => {
      const box = observable.box([1, 2]); // Deep by default: the array is converted into an observable array
      expect(isObservableArray(box.get())).toBe(true);

      const result = shallowReadValue(box);
      expect(result).not.toBe(box.get());
      expect(isObservableArray(result)).toBe(false);
      expect(result).toEqual([1, 2]);

      const setResult = shallowReadValue(observable.box(new Set([1])));
      expect(isObservableSet(setResult)).toBe(false);
      expect(setResult).toEqual(new Set([1]));

      const mapResult = shallowReadValue(observable.box(new Map([["key", 1]])));
      expect(isObservableMap(mapResult)).toBe(false);
      expect(mapResult).toEqual(new Map([["key", 1]]));
    });

    test("does not copy plain collections held by non-deep boxed observables", () => {
      const arr = [1, 2];
      const box = observable.box(arr, { deep: false });
      expect(shallowReadValue(box)).toBe(arr);
    });

    test("unwraps only one level of boxed observables", () => {
      const inner = observable.box([1]);
      const outer = observable.box(inner);
      expect(shallowReadValue(outer)).toBe(inner);
    });

    test("does not unwrap computed values", () => {
      const value = computed(() => [1]);
      expect(shallowReadValue(value)).toBe(value);
    });

    test("copies non-proxied (legacy) observable arrays, which are not Array.isArray", () => {
      const arr = withLegacyArrays(() => observable.array([1, 2]));
      expect(Array.isArray(arr)).toBe(false);
      expect(isObservableArray(arr)).toBe(true);

      const result = shallowReadValue(arr);
      expect(result).not.toBe(arr);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([1, 2]);
    });
  });

  describe("reactivity", () => {
    test("no-op updates to observable arrays do not trigger the reaction", () => {
      const arr = observable.array([1]);
      const effectFn = vi.fn();
      reaction(() => shallowReadValue(arr), effectFn);

      runInAction(() => (arr[0] = 1));
      expect(effectFn).toBeCalledTimes(0);
    });

    test("removal of elements from observable arrays can be observed", () => {
      const arr = observable.array([1, 2]);
      const effectFn = vi.fn();
      reaction(() => shallowReadValue(arr), effectFn);

      runInAction(() => arr.pop());
      expect(effectFn).toBeCalledTimes(1);
      expect(effectFn).lastCalledWith([1], [1, 2], expect.anything());
    });

    test("changes to properties of elements of observable arrays CANNOT be observed", () => {
      const arr = observable.array([{ value: 0 }]);
      const effectFn = vi.fn();
      reaction(() => shallowReadValue(arr), effectFn);

      runInAction(() => arr[0].value++);
      expect(effectFn).toBeCalledTimes(0);
    });

    test("replacing the elements of an observable array with equal ones triggers a reaction unless it compares shallowly", () => {
      const arr = observable.array([1, 2]);
      const defaultEffectFn = vi.fn();
      const shallowEffectFn = vi.fn();
      reaction(() => shallowReadValue(arr), defaultEffectFn);
      reaction(() => shallowReadValue(arr), shallowEffectFn, { equals: comparer.shallow });

      runInAction(() => arr.replace([1, 2]));
      // A fresh copy is returned on every read, so comparing the contents is up to the consumer's comparer.
      // (How Watcher's reactions, which pass no `equals`, are affected is pinned in watcher.test.ts.)
      expect(defaultEffectFn).toBeCalledTimes(1);
      expect(shallowEffectFn).toBeCalledTimes(0);
    });

    test("removal of values from observable sets can be observed, but adding an existing value or clearing an empty set CANNOT", () => {
      const set = observable.set([1]);
      const effectFn = vi.fn();
      reaction(() => shallowReadValue(set), effectFn);

      runInAction(() => set.add(1));
      expect(effectFn).toBeCalledTimes(0);

      runInAction(() => set.delete(1));
      expect(effectFn).toBeCalledTimes(1);

      runInAction(() => set.clear());
      expect(effectFn).toBeCalledTimes(1);
    });

    test("deletion of keys from observable maps can be observed, but setting the same value CANNOT", () => {
      const map = observable.map([["key", 1]]);
      const effectFn = vi.fn();
      reaction(() => shallowReadValue(map), effectFn);

      runInAction(() => map.set("key", 1));
      expect(effectFn).toBeCalledTimes(0);

      runInAction(() => map.delete("key"));
      expect(effectFn).toBeCalledTimes(1);
    });

    test("both replacing the content of boxed observables and mutating the observable collection inside can be observed", () => {
      const box = observable.box<any>(0);
      const effectFn = vi.fn();
      reaction(() => shallowReadValue(box), effectFn);

      runInAction(() => box.set(observable.array([1])));
      expect(effectFn).toBeCalledTimes(1);

      runInAction(() => box.get().push(2));
      expect(effectFn).toBeCalledTimes(2);
      expect(effectFn).lastCalledWith([1, 2], [1], expect.anything());
    });

    test("changes to the content of boxed observables nested in boxed observables CANNOT be observed", () => {
      const inner = observable.box(1);
      const outer = observable.box(inner);
      const effectFn = vi.fn();
      reaction(() => shallowReadValue(outer), effectFn);

      runInAction(() => inner.set(2));
      expect(effectFn).toBeCalledTimes(0);
    });
  });
});

describe("unwrapShallowContents", () => {
  const entriesOf = (value: any) => [...unwrapShallowContents(value)];

  test("unwraps boxed observables", () => {
    const obj = observable.box(123);
    const result = new Map();
    for (const [key, value] of unwrapShallowContents(obj)) {
      result.set(key, value);
    }
    expect(result).toEqual(new Map([[null, 123]]));
  });

  test("unwraps observable arrays", () => {
    const arr = observable.array([11, 22, 33]);
    const result = new Map();
    for (const [key, value] of unwrapShallowContents(arr)) {
      result.set(key, value);
    }
    expect(result).toEqual(
      new Map([
        [0, 11],
        [1, 22],
        [2, 33],
      ])
    );
  });

  test("unwraps observable sets", () => {
    const set = observable.set([11, 22, 33]);
    const result = new Map();
    for (const [key, value] of unwrapShallowContents(set)) {
      result.set(key, value);
    }
    expect(result).toEqual(
      new Map([
        [0, 11],
        [1, 22],
        [2, 33],
      ])
    );
  });

  test("unwraps observable maps", () => {
    const map = observable.map([
      ["key1", 11],
      ["key2", 22],
      ["key3", 33],
    ]);
    const result = new Map();
    for (const [key, value] of unwrapShallowContents(map)) {
      result.set(key, value);
    }
    expect(result).toEqual(
      new Map([
        ["key1", 11],
        ["key2", 22],
        ["key3", 33],
      ])
    );
  });

  test("signature", () => {
    expectTypeOf(unwrapShallowContents).parameter(0).toBeAny();
    expectTypeOf(unwrapShallowContents(null)).toEqualTypeOf<
      Generator<[key: string | symbol | number | null, content: any]>
    >();
  });

  describe("non-collection values", () => {
    test.each<[string, unknown]>([
      ["undefined", undefined],
      ["null", null],
      ["a number", 1],
      ["a string", "str"],
      ["a boolean", false],
      ["a symbol", Symbol("sym")],
      ["a function", () => {}],
      ["a plain object", { value: 0 }],
      ["an observable object", observable({ value: 0 })],
      ["a computed value", computed(() => [1])],
      ["a typed array", new Uint8Array([1, 2])],
      ["a weak map", new WeakMap()],
      ["a weak set", new WeakSet()],
      ["an iterable", { *[Symbol.iterator]() {} }],
    ])("yields %s as a single entry with a null key", (_, value) => {
      const result = entriesOf(value);
      expect(result).toHaveLength(1);
      expect(result[0][0]).toBeNull();
      expect(result[0][1]).toBe(value);
    });

    test("yields the content of boxed observables holding a non-collection value", () => {
      const content = { value: 0 };
      expect(entriesOf(observable.box(content, { deep: false }))).toEqual([[null, content]]);
      expect(entriesOf(observable.box(undefined))).toEqual([[null, undefined]]);
    });

    test("unwraps only one level of boxed observables", () => {
      const inner = observable.box([1]);
      const result = entriesOf(observable.box(inner));
      expect(result).toHaveLength(1);
      expect(result[0][0]).toBeNull();
      expect(result[0][1]).toBe(inner);
    });
  });

  describe("collections", () => {
    test("unwraps plain arrays with numeric index keys", () => {
      const result = entriesOf(["a", "b"]);
      expect(result).toEqual([
        [0, "a"],
        [1, "b"],
      ]);
      expect(typeof result[0][0]).toBe("number");
    });

    test("yields undefined for holes in sparse arrays", () => {
      const arr = new Array<number>(2);
      arr[1] = 1;
      expect(entriesOf(arr)).toEqual([
        [0, undefined],
        [1, 1],
      ]);
    });

    test("unwraps plain sets with insertion-order index keys instead of the values", () => {
      expect(entriesOf(new Set(["x", "y"]))).toEqual([
        [0, "x"],
        [1, "y"],
      ]);
    });

    test("unwraps plain maps with their own keys in insertion order", () => {
      expect(
        entriesOf(
          new Map<string | number, string>([
            ["b", "x"],
            [1, "y"],
            ["a", "z"],
          ])
        )
      ).toEqual([
        ["b", "x"],
        [1, "y"],
        ["a", "z"],
      ]);
    });

    test("unwraps subclasses of Array, Set, and Map", () => {
      class MyArray extends Array<string> {}
      class MySet extends Set<string> {}
      class MyMap extends Map<string, string> {}

      expect(entriesOf(MyArray.from(["a"]))).toEqual([[0, "a"]]);
      expect(entriesOf(new MySet(["a"]))).toEqual([[0, "a"]]);
      expect(entriesOf(new MyMap([["key", "a"]]))).toEqual([["key", "a"]]);
    });

    test("unwraps boxed observables holding collections", () => {
      expect(entriesOf(observable.box(["a", "b"]))).toEqual([
        [0, "a"],
        [1, "b"],
      ]);
      expect(entriesOf(observable.box(new Set(["a"])))).toEqual([[0, "a"]]);
      expect(entriesOf(observable.box(new Map([["key", "a"]])))).toEqual([["key", "a"]]);
      expect(entriesOf(observable.box(["a"], { deep: false }))).toEqual([[0, "a"]]);
    });

    test("yields nothing for empty collections", () => {
      const values = [
        [],
        new Set(),
        new Map(),
        observable.array(),
        observable.set(),
        observable.map(),
        observable.box([]),
        observable.box(new Set()),
        observable.box(new Map()),
      ];
      for (const value of values) {
        expect(entriesOf(value)).toEqual([]);
      }
    });

    test("does not copy the yielded contents", () => {
      const element = { value: 0 };
      expect(entriesOf([element])[0][1]).toBe(element);
      expect(entriesOf(new Set([element]))[0][1]).toBe(element);
      expect(entriesOf(new Map([["key", element]]))[0][1]).toBe(element);
    });

    test("yields map keys of any type as-is, including ones outside the declared key type", () => {
      const objectKey = {};
      const symbolKey = Symbol("key");
      const result = entriesOf(
        new Map<unknown, number>([
          [objectKey, 1],
          [true, 2],
          [undefined, 3],
          ["str", 4],
          [5, 5],
          [symbolKey, 6],
        ])
      );

      const isDeclaredKeyType = (key: unknown) => key === null || ["string", "symbol", "number"].includes(typeof key);

      // Keys of the declared types are yielded as-is, in insertion order
      expect(result.filter(([key]) => isDeclaredKeyType(key))).toEqual([
        ["str", 4],
        [5, 5],
        [symbolKey, 6],
      ]);
      // PINNED(bug): map keys that are not string | symbol | number (here an object, a boolean, and undefined) are yielded as-is, although the signature declares `key: string | symbol | number | null`; consumers such as StandardNestedFetcher pass them to KeyPath.build. Expected: such keys are skipped, making this toEqual([]) (or the declared key type is widened instead). Flip this assertion when fixing.
      expect(result.filter(([key]) => !isDeclaredKeyType(key))).toEqual([
        [objectKey, 1],
        [true, 2],
        [undefined, 3],
      ]);
    });

    test("unwraps non-proxied (legacy) observable arrays, which are not Array.isArray", () => {
      const arr = withLegacyArrays(() => observable.array(["a", "b"]));
      expect(Array.isArray(arr)).toBe(false);

      expect(entriesOf(arr)).toEqual([
        [0, "a"],
        [1, "b"],
      ]);
      expect(entriesOf(withLegacyArrays(() => observable.box(["a"])))).toEqual([[0, "a"]]);
    });

    test("a null map key yields the same entry as a non-collection value", () => {
      // PINNED(quirk): a `null` map key produces `[null, value]`, the same shape that marks a non-collection value, so callers cannot tell the two apart. Decide: should null map keys be skipped or distinguished from the non-collection case? If so, this becomes not.toEqual.
      expect(entriesOf(new Map([[null, 1]]))).toEqual(entriesOf(1));
    });
  });

  describe("iteration", () => {
    test("reads the value lazily when the iteration starts", () => {
      const box = observable.box([1]);
      const generator = unwrapShallowContents(box);

      runInAction(() => box.set([2, 3]));
      expect([...generator]).toEqual([
        [0, 2],
        [1, 3],
      ]);
    });
  });

  describe("reactivity", () => {
    test("iterating observable maps observes updates, additions, and deletions of entries", () => {
      const map = observable.map<string, number>({ x: 1 });
      const effectFn = vi.fn();
      reaction(
        () =>
          entriesOf(map)
            .map(([key, value]) => `${String(key)}=${value}`)
            .join(","),
        effectFn
      );

      runInAction(() => map.set("x", 2));
      runInAction(() => map.set("y", 3));
      runInAction(() => map.delete("x"));
      expect(effectFn.mock.calls.map((call) => call[0])).toEqual(["x=2", "x=2,y=3", "y=3"]);
    });

    test("iterating observable sets observes additions and deletions of values", () => {
      const set = observable.set([1]);
      const effectFn = vi.fn();
      reaction(() => entriesOf(set).map(([, value]) => value), effectFn, { equals: comparer.structural });

      runInAction(() => set.add(2));
      runInAction(() => set.delete(1));
      expect(effectFn.mock.calls.map((call) => call[0])).toEqual([[1, 2], [2]]);
    });

    test("iterating boxed observables observes both replacement of the content and mutations of the array inside", () => {
      const box = observable.box<number[]>([1]);
      const effectFn = vi.fn();
      reaction(() => entriesOf(box).length, effectFn);

      runInAction(() => box.get().push(2));
      runInAction(() => box.set([1, 2, 3]));
      expect(effectFn.mock.calls.map((call) => call[0])).toEqual([2, 3]);
    });

    test("changes to properties of the yielded contents CANNOT be observed", () => {
      const arr = observable.array([{ value: 0 }]);
      const effectFn = vi.fn();
      reaction(() => entriesOf(arr).map(([, value]) => value), effectFn);

      runInAction(() => arr[0].value++);
      expect(effectFn).toBeCalledTimes(0);
    });
  });
});

describe("getMobxObservableAnnotations", () => {
  class Sample {
    @observable field1 = 123;
    @observable.ref field2 = 456;
    @observable.deep field3 = { value: 0 };
    @observable.shallow field4 = { value: 0 };
    @observable.struct field5 = { value: 0 };

    constructor() {
      makeObservable(this);
    }

    @computed get computed1() {
      return this.field1 * 2;
    }
    @computed.struct get computed2() {
      return [this.field1];
    }

    // Actions are not included in the result
    @action action1() {}
    @action.bound action2() {}
  }

  const keysOf = (target: any) => [...getMobxObservableAnnotations(target)].map(([key]) => key);
  const readAll = (target: any) =>
    [...getMobxObservableAnnotations(target)].map(([key, getValue]) => [key, getValue()]);

  test("List of annotated properties can be retrieved", () => {
    const obj = new Sample();
    const result = new Map();

    for (const [key, value] of getMobxObservableAnnotations(obj)) {
      result.set(key, value());
    }

    expect(result).toEqual(
      new Map<any, any>([
        ["field1", obj.field1],
        ["field2", obj.field2],
        ["field3", obj.field3],
        ["field4", obj.field4],
        ["field5", obj.field5],
        ["computed1", obj.computed1],
        ["computed2", obj.computed2],
      ])
    );
  });

  test("signature", () => {
    expectTypeOf(getMobxObservableAnnotations).parameter(0).toEqualTypeOf<object>();
    expectTypeOf(getMobxObservableAnnotations({})).toEqualTypeOf<
      Generator<[key: string | symbol | number, getValue: () => any]>
    >();
  });

  test("yields keys in the order of declaration, with the getters returning the current values", () => {
    const obj = new Sample();
    expect(keysOf(obj)).toEqual(["field1", "field2", "field3", "field4", "field5", "computed1", "computed2"]);

    const getters = new Map(getMobxObservableAnnotations(obj));
    expect(getters.get("field3")!()).toBe(obj.field3);
    expect(getters.get("computed2")!()).toEqual([123]);
  });

  describe("targets without MobX annotations", () => {
    test("yields nothing for non-observable values", () => {
      class Plain {
        field = 1;
        get getter() {
          return this.field;
        }
      }
      const values = [new Plain(), { value: 0 }, [1], new Set([1]), new Map([["key", 1]]), () => {}];
      for (const value of values) {
        expect(keysOf(value)).toEqual([]);
      }
    });

    test("yields nothing for observable values other than observable objects", () => {
      const values = [
        observable.array([1]),
        observable.set([1]),
        observable.map({ key: 1 }),
        observable.box(1),
        computed(() => 1),
      ];
      for (const value of values) {
        expect(keysOf(value)).toEqual([]);
      }
    });

    test("yields nothing for nullish and primitive values", () => {
      // @ts-expect-error: rejected by the signature
      expect([...getMobxObservableAnnotations(null)]).toEqual([]);
      // @ts-expect-error: rejected by the signature
      expect([...getMobxObservableAnnotations(undefined)]).toEqual([]);
      // @ts-expect-error: rejected by the signature
      expect([...getMobxObservableAnnotations(1)]).toEqual([]);
      // @ts-expect-error: rejected by the signature
      expect([...getMobxObservableAnnotations("str")]).toEqual([]);
    });

    test("yields nothing for an observable object with no properties", () => {
      expect(keysOf(observable({}))).toEqual([]);
    });
  });

  describe("makeObservable with an annotation map", () => {
    test("yields observable and computed annotations and their variants, but not actions, flows, or unannotated fields", () => {
      class Sample {
        field1 = 1;
        field2 = 2;
        field3 = [1];
        field4 = [2];
        field5 = { value: 0 };
        unannotated = 3;

        constructor() {
          makeObservable(this, {
            field1: observable,
            field2: observable.ref,
            field3: observable.shallow,
            field4: observable.deep,
            field5: observable.struct,
            computed1: computed,
            computed2: computed.struct,
            action1: action,
            flow1: flow,
          });
        }

        get computed1() {
          return this.field1 * 2;
        }
        get computed2() {
          return [this.field2];
        }
        action1() {}
        *flow1() {}
      }

      expect(readAll(new Sample())).toEqual([
        ["field1", 1],
        ["field2", 2],
        ["field3", [1]],
        ["field4", [2]],
        ["field5", { value: 0 }],
        ["computed1", 2],
        ["computed2", [2]],
      ]);
    });
  });

  describe("makeAutoObservable", () => {
    test("yields fields and getters, but not methods, flows, or excluded keys", () => {
      class Sample {
        field1 = 1;
        excluded = 2;

        constructor() {
          makeAutoObservable(this, { excluded: false });
        }

        get computed1() {
          return this.field1 * 2;
        }
        action1() {}
        *flow1() {}
      }

      expect(readAll(new Sample())).toEqual([
        ["field1", 1],
        ["computed1", 2],
      ]);
    });
  });

  describe("observable objects", () => {
    test("yields properties and getters in property order, including integer-like and symbol keys", () => {
      const symbolKey = Symbol("key");
      const obj = observable({
        b: 1,
        get computed1() {
          return this.b * 2;
        },
        a: "a",
        10: "ten",
        [symbolKey]: "symbol",
      });

      const result = readAll(obj);
      // Integer-like keys come first as strings, and symbol keys come last (the order of Reflect.ownKeys)
      expect(result).toEqual([
        ["10", "ten"],
        ["b", 1],
        ["computed1", 2],
        ["a", "a"],
        [symbolKey, "symbol"],
      ]);
      expect(typeof result[0][0]).toBe("string");
    });

    test("yields function-valued properties", () => {
      const obj = observable({
        value: 1,
        method() {
          return 1;
        },
        *generator() {},
      });

      // PINNED(quirk): observable() stores function-valued own properties as observable values (holding auto actions), so they are yielded like data fields, unlike methods under makeAutoObservable. Decide: should function-valued entries be skipped? If so, this becomes toEqual(["value"]).
      expect(keysOf(obj)).toEqual(["value", "method", "generator"]);
    });

    test("yields getters with setters", () => {
      const obj = observable({
        raw: 1,
        get value() {
          return this.raw;
        },
        set value(value: number) {
          this.raw = value;
        },
      });
      expect(readAll(obj)).toEqual([
        ["raw", 1],
        ["value", 1],
      ]);
    });

    test("yields properties of non-proxied and non-deep observable objects", () => {
      expect(readAll(observable({ value: 1 }, {}, { proxy: false }))).toEqual([["value", 1]]);

      const arr = [1];
      const shallow = observable({ arr }, {}, { deep: false });
      const getters = new Map(getMobxObservableAnnotations(shallow));
      expect(getters.get("arr")!()).toBe(arr);
    });

    test("yields properties added by extendObservable", () => {
      class Sample {
        constructor() {
          extendObservable(this, {
            field1: 1,
            get computed1() {
              return 2;
            },
          });
        }
      }
      expect(readAll(new Sample())).toEqual([
        ["field1", 1],
        ["computed1", 2],
      ]);
    });

    test("yields properties added after creation, and no longer yields removed ones", () => {
      const obj = observable<Record<string, number>>({ a: 1, b: 2 });

      runInAction(() => {
        obj.c = 3;
        set(obj, "d", 4);
        delete obj.a;
        remove(obj, "b");
      });
      expect(readAll(obj)).toEqual([
        ["c", 3],
        ["d", 4],
      ]);
    });
  });

  describe("inheritance", () => {
    test("yields annotations of both base and derived classes, once for overridden keys", () => {
      class Base {
        @observable base = 1;

        constructor() {
          makeObservable(this);
        }

        @computed get overridden() {
          return "base";
        }
      }

      class Derived extends Base {
        @observable derived = 2;

        constructor() {
          super();
          makeObservable(this);
        }

        @override get overridden() {
          return "derived";
        }
      }

      expect(readAll(new Derived())).toEqual([
        ["base", 1],
        ["overridden", "derived"],
        ["derived", 2],
      ]);
      expect(readAll(new Base())).toEqual([
        ["base", 1],
        ["overridden", "base"],
      ]);
    });
  });

  describe("getValue", () => {
    test("reads the value at the time of the call", () => {
      const obj = new Sample();
      const getters = new Map(getMobxObservableAnnotations(obj));

      runInAction(() => (obj.field1 = 1));
      expect(getters.get("field1")!()).toBe(1);
      expect(getters.get("computed1")!()).toBe(2);
    });

    test("reads are tracked by reactions", () => {
      const obj = new Sample();
      const effectFn = vi.fn();
      const disposers: (() => void)[] = [];
      for (const [key, getValue] of getMobxObservableAnnotations(obj)) {
        disposers.push(reaction(getValue, (value) => effectFn(key, value)));
      }

      runInAction(() => (obj.field1 = 1));
      expect(effectFn.mock.calls).toEqual([
        ["field1", 1],
        ["computed1", 2],
        ["computed2", [1]],
      ]);

      // Keys that do not depend on the updated one are not notified
      effectFn.mockClear();
      runInAction(() => (obj.field2 = 0));
      expect(effectFn.mock.calls).toEqual([["field2", 0]]);

      for (const dispose of disposers) dispose();
    });

    test("enumeration alone does not evaluate computed getters", () => {
      const getterFn = vi.fn(() => 1);
      const obj = observable({
        get computed1() {
          return getterFn();
        },
      });

      const entries = [...getMobxObservableAnnotations(obj)];
      expect(getterFn).toBeCalledTimes(0);

      expect(entries[0][1]()).toBe(1);
      expect(getterFn).toBeCalledTimes(1);
    });

    test("falls back to the administration when the key is not reachable on the target", () => {
      const obj: Record<string, number> = observable({ value: 1 }, {}, { proxy: false });
      // Bypass MobX so that the administration keeps the entry while the target loses the property
      delete obj.value;
      expect("value" in obj).toBe(false);

      expect(readAll(obj)).toEqual([["value", 1]]);
    });

    test("reads through the target, so a property that replaces the annotated accessor takes precedence", () => {
      const obj: Record<string, number> = observable({ value: 1 }, {}, { proxy: false });
      const adm = (obj as any)[$mobx];
      const getValue = new Map(getMobxObservableAnnotations(obj)).get("value")!;

      // Bypass MobX so that the administration keeps the entry while the target gets a plain property
      Object.defineProperty(obj, "value", { value: 99 });
      expect(adm.values_.get("value").get()).toBe(1);

      expect(getValue()).toBe(99);
    });

    test("follows a key that is removed and added again after the enumeration", () => {
      const obj = observable<Record<string, number>>({ value: 1 });
      const getValue = new Map(getMobxObservableAnnotations(obj)).get("value")!;
      const effectFn = vi.fn();
      const dispose = reaction(getValue, effectFn);

      runInAction(() => remove(obj, "value"));
      expect(obj.value).toBeUndefined();
      // PINNED(quirk): after the key is removed, the getter falls back to the detached administration entry (captured at enumeration) and keeps returning the last value, so a reaction over it (as Watcher sets up) sees no change. Decide: should removing an annotated key read as `undefined` (and count as a change)? If so, getValue() becomes toBeUndefined() and effectFn is called 1 time here.
      expect(getValue()).toBe(1);
      expect(effectFn).toBeCalledTimes(0);
      effectFn.mockClear(); // Keep the assertions below independent of the pinned behavior

      // The getter reads through the target again once the key is back, and the reaction tracks the new entry
      runInAction(() => set(obj, "value", 5));
      expect(getValue()).toBe(5);
      expect(effectFn).toBeCalledTimes(1);
      expect(effectFn.mock.lastCall?.[0]).toBe(5);

      runInAction(() => (obj.value = 6));
      expect(effectFn).toBeCalledTimes(2);
      expect(effectFn).lastCalledWith(6, 5, expect.anything());

      dispose();
    });

    test("propagates errors thrown by computed getters, while enumeration alone does not throw", () => {
      const obj = observable({
        value: 1,
        get failing(): number {
          throw new Error("boom");
        },
      });

      const getters = new Map(getMobxObservableAnnotations(obj));
      expect([...getters.keys()]).toEqual(["value", "failing"]);
      expect(() => getters.get("failing")!()).toThrow("boom");
      expect(getters.get("value")!()).toBe(1);
    });
  });

  describe("targets inheriting from an observable object", () => {
    test("yields the annotations of the observable prototype", () => {
      const proto = observable({ value: 1 });
      const child = Object.create(proto);
      expect(Object.hasOwn(child, $mobx)).toBe(false);

      // PINNED(quirk): the administration is looked up through the prototype chain (`target[$mobx]`), so a non-observable object that merely inherits from an observable one yields the prototype's annotations. Decide: should only an own administration count? If so, this becomes toEqual([]).
      expect(readAll(child)).toEqual([["value", 1]]);
    });
  });

  describe("enumeration", () => {
    test("is lazy: keys added before the iteration starts are included", () => {
      const obj = observable<Record<string, number>>({ a: 1 });
      const generator = getMobxObservableAnnotations(obj);

      runInAction(() => (obj.b = 2));
      expect([...generator].map(([key]) => key)).toEqual(["a", "b"]);
    });

    test("iterates a snapshot, so keys added or removed during the iteration do not affect it", () => {
      const obj = observable<Record<string, number>>({ a: 1, b: 2 });
      const seen: PropertyKey[] = [];
      const getters = new Map<PropertyKey, () => any>();

      for (const [key, getValue] of getMobxObservableAnnotations(obj)) {
        seen.push(key);
        getters.set(key, getValue);
        if (key === "a") {
          runInAction(() => {
            obj.added = 3;
            remove(obj, "b");
          });
        }
      }

      expect(seen).toEqual(["a", "b"]);
      expect("b" in obj).toBe(false);
      expect(obj.b).toBeUndefined();
      // PINNED(quirk): the getter of a key removed during the iteration falls back to its detached administration entry and returns the last value, not `undefined` as reading the property does now (the same fallback as in "follows a key that is removed and added again after the enumeration"). Decide: should getValue re-check that the key is still annotated? If so, this becomes toBeUndefined().
      expect(getters.get("b")!()).toBe(2);

      expect(keysOf(obj)).toEqual(["a", "added"]);
    });

    test("enumerating keys is not tracked by reactions", () => {
      const obj = observable<Record<string, number>>({ a: 1 });
      const enumerateFn = vi.fn();
      const objectKeysFn = vi.fn();
      const dispose1 = autorun(() => enumerateFn(keysOf(obj)));
      const dispose2 = autorun(() => objectKeysFn(Object.keys(obj)));

      runInAction(() => (obj.added = 2));
      expect(objectKeysFn).toBeCalledTimes(2);
      // PINNED(quirk): enumeration reads the administration's `values_` map directly without reporting its keys atom, so a derivation that enumerates is not re-run when a key is added (unlike Object.keys). Decide: should enumeration report the keys atom so that consumers can pick up keys added later? If so, enumerateFn is called 2 times.
      expect(enumerateFn).toBeCalledTimes(1);
      expect(keysOf(obj)).toEqual(["a", "added"]);

      dispose1();
      dispose2();
    });

    test("can be stopped early", () => {
      const generator = getMobxObservableAnnotations(new Sample());
      expect(generator.next().value?.[0]).toBe("field1");
      expect(generator.return(undefined)).toEqual({ done: true, value: undefined });
      expect(generator.next()).toEqual({ done: true, value: undefined });
    });
  });

  // The function relies on MobX internals and guards each of them at runtime, so that a change of the internal API
  // degrades to yielding less instead of throwing. These tests tamper with a real administration to exercise the guards.
  describe("guards against changes of the internal API", () => {
    const createTarget = () => {
      const obj = observable({ value: 1 }, {}, { proxy: false });
      const adm = (obj as any)[$mobx];
      return { obj, adm };
    };

    test("yields nothing when the administration has no values_", () => {
      const { obj, adm } = createTarget();
      delete adm.values_;
      expect(keysOf(obj)).toEqual([]);
    });

    test("yields nothing when values_ is not a map", () => {
      const { obj, adm } = createTarget();
      adm.values_ = { value: observable.box(1) };
      expect(keysOf(obj)).toEqual([]);
    });

    test("skips entries of values_ that are not objects with a get function", () => {
      const { obj, adm } = createTarget();
      adm.values_.set("primitive", 1);
      adm.values_.set("null", null);
      adm.values_.set("noGetter", {});
      adm.values_.set("nonFunctionGetter", { get: 1 });

      expect(readAll(obj)).toEqual([["value", 1]]);
    });

    test("skips entries of values_ that are functions, even with a get function", () => {
      const { obj, adm } = createTarget();
      adm.values_.set(
        "function",
        Object.assign(() => 2, { get: () => 2 })
      );

      expect(readAll(obj)).toEqual([["value", 1]]);
    });

    test("skips entries of values_ whose keys are not strings, symbols, or numbers", () => {
      const { obj, adm } = createTarget();
      adm.values_.set({}, observable.box(2));
      adm.values_.set(3, observable.box(3));

      expect(readAll(obj)).toEqual([
        ["value", 1],
        [3, 3],
      ]);
    });

    test("ignores pending lazy keys when the administration has no getObservablePropValue_", () => {
      const { obj, adm } = createTarget();
      adm.getObservablePropValue_ = undefined;
      adm.lazyObservableKeys_ = new Map([["lazyObservable", () => observable.box(10)]]);
      adm.lazyComputedKeys_ = new Map([["lazyComputed", () => computed(() => 20)]]);

      // Only enumerate: the property accessors of the target read through getObservablePropValue_ as well
      expect(keysOf(obj)).toEqual(["value"]);
    });
  });

  // MobX 6.16+ applies stage-3 decorator annotations lazily: the keys stay in `lazyObservableKeys_` /
  // `lazyComputedKeys_` until first read. Files under src/ compile stage-2 decorators, which never populate
  // those maps (test-stage3/ covers the real thing), so these tests populate them by hand to pin down how
  // the function treats them. Older MobX (e.g. 6.11) cannot materialize such keys, so the tests are skipped there.
  const supportsLazyAnnotations = typeof (observable({}) as any)[$mobx].materializeLazyObservable_ === "function";

  describe.skipIf(!supportsLazyAnnotations)("lazily applied annotations (MobX 6.16+)", () => {
    const createTarget = () => {
      const obj = observable({ materialized: 1 }, {}, { proxy: false });
      const adm = (obj as any)[$mobx];
      return { obj, adm };
    };

    test("yields pending keys before materialized ones, without materializing them", () => {
      const { obj, adm } = createTarget();
      adm.lazyObservableKeys_ = new Map([["lazyObservable", () => observable.box(10)]]);
      adm.lazyComputedKeys_ = new Map([["lazyComputed", () => computed(() => 20)]]);

      expect(keysOf(obj)).toEqual(["lazyObservable", "lazyComputed", "materialized"]);
      expect([...adm.values_.keys()]).toEqual(["materialized"]);
      expect(adm.lazyObservableKeys_.size).toBe(1);
      expect(adm.lazyComputedKeys_.size).toBe(1);
    });

    test("getters materialize pending keys, which are then not yielded again from the materialized ones", () => {
      const { obj, adm } = createTarget();
      adm.lazyObservableKeys_ = new Map([["lazyObservable", () => observable.box(10)]]);
      adm.lazyComputedKeys_ = new Map([["lazyComputed", () => computed(() => 20)]]);

      expect(readAll(obj)).toEqual([
        ["lazyObservable", 10],
        ["lazyComputed", 20],
        ["materialized", 1],
      ]);
      expect([...adm.values_.keys()]).toEqual(["materialized", "lazyObservable", "lazyComputed"]);
      expect(adm.lazyObservableKeys_).toBeUndefined();
      expect(adm.lazyComputedKeys_).toBeUndefined();

      // Once materialized, the keys are yielded from the materialized ones
      expect(readAll(obj)).toEqual([
        ["materialized", 1],
        ["lazyObservable", 10],
        ["lazyComputed", 20],
      ]);
    });

    test("getters consumed during the enumeration, as Watcher does, do not make materialized keys yielded again", () => {
      const { obj, adm } = createTarget();
      const box = observable.box(10);
      adm.lazyObservableKeys_ = new Map([["lazyObservable", () => box]]);
      adm.lazyComputedKeys_ = new Map([["lazyComputed", () => computed(() => box.get() * 2)]]);

      const seen: PropertyKey[] = [];
      const effectFn = vi.fn();
      const disposers: (() => void)[] = [];
      for (const [key, getValue] of getMobxObservableAnnotations(obj)) {
        seen.push(key);
        // The reaction reads the value immediately, which materializes the key before `values_` is enumerated
        disposers.push(reaction(getValue, (value) => effectFn(key, value)));
      }

      expect(seen).toEqual(["lazyObservable", "lazyComputed", "materialized"]);
      expect([...adm.values_.keys()]).toEqual(["materialized", "lazyObservable", "lazyComputed"]);

      // Reads of pending keys are tracked
      runInAction(() => box.set(11));
      expect(effectFn.mock.calls).toEqual([
        ["lazyObservable", 11],
        ["lazyComputed", 22],
      ]);

      for (const dispose of disposers) dispose();
    });

    test("yields pending keys of one map when the other one is absent", () => {
      const { obj, adm } = createTarget();
      expect(adm.lazyObservableKeys_).toBeUndefined();
      adm.lazyComputedKeys_ = new Map([["lazyComputed", () => computed(() => 20)]]);

      expect(readAll(obj)).toEqual([
        ["lazyComputed", 20],
        ["materialized", 1],
      ]);
    });

    test("yields a key pending in both maps once", () => {
      const { obj, adm } = createTarget();
      adm.lazyObservableKeys_ = new Map([["duplicate", () => observable.box(10)]]);
      adm.lazyComputedKeys_ = new Map([["duplicate", () => computed(() => 10)]]);

      expect(readAll(obj)).toEqual([
        ["duplicate", 10],
        ["materialized", 1],
      ]);
    });

    test("skips pending keys that are not strings, symbols, or numbers", () => {
      const { obj, adm } = createTarget();
      const symbolKey = Symbol("key");
      adm.lazyObservableKeys_ = new Map<unknown, () => unknown>([
        [{}, () => observable.box(0)],
        [symbolKey, () => observable.box(1)],
        [2, () => observable.box(2)],
      ]);

      expect(readAll(obj)).toEqual([
        [symbolKey, 1],
        [2, 2],
        ["materialized", 1],
      ]);
    });

    test("ignores pending key containers that are not maps", () => {
      const { obj, adm } = createTarget();
      adm.lazyObservableKeys_ = { lazyObservable: () => observable.box(10) };
      adm.lazyComputedKeys_ = [["lazyComputed", () => computed(() => 20)]];

      expect(keysOf(obj)).toEqual(["materialized"]);
    });
  });
});
