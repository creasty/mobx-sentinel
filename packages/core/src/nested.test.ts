import { autorun, computed, makeObservable, observable, runInAction } from "mobx";
import { onTestFinished } from "vitest";
import { getNestedAnnotations, nested, StandardNestedFetcher } from "./nested";
import { KeyPath } from "./keyPath";
import { createPropertyLikeAnnotation } from "./annotationProcessor";

const symbolKey1 = Symbol("key1");

class Sample {
  @nested [symbolKey1] = {};

  @nested @observable number1 = 0;
  @nested @observable object1 = { value: 0 };
  @nested @observable other1 = new Other();
  @nested @observable array1 = [0];
  @nested @observable array2 = [{ value: 0 }];
  @nested @observable otherArray1 = [new Other()];
  @nested @observable set1 = new Set([0]);
  @nested @observable set2 = new Set([{ value: 0 }]);
  @nested @observable otherSet1 = new Set([new Other()]);
  @nested @observable map1 = new Map([["key1", 0]]);
  @nested @observable map2 = new Map([["key1", { value: 0 }]]);
  @nested @observable otherMap1 = new Map([["key1", new Other()]]);

  @nested boxedNumber1 = observable.box(0);
  @nested boxedObject1 = observable.box({ value: 0 });
  @nested boxedOther1 = observable.box(new Other());
  @nested boxedArray1 = observable.box([0, 1, 2]);
  @nested boxedArray2 = observable.box([{ value: 0 }]);
  @nested boxedOtherArray1 = observable.box([new Other()]);
  @nested boxedSet1 = observable.box(new Set([0]));
  @nested boxedSet2 = observable.box(new Set([{ value: 0 }]));
  @nested boxedOtherSet1 = observable.box(new Set([new Other()]));
  @nested boxedMap1 = observable.box(new Map([["key1", 0]]));
  @nested boxedMap2 = observable.box(new Map([["key1", { value: 0 }]]));
  @nested boxedOtherMap1 = observable.box(new Map([["key1", new Other()]]));

  @nested @observable.ref refObject1 = { value: 0 };
  @nested @observable.ref refOther1 = new Other();
  @nested @observable.ref refArray1 = [0];
  @nested @observable.ref refOtherArray1 = [new Other()];
  @nested @observable.ref refSet1 = new Set([0]);
  @nested @observable.ref refSet2 = new Set([{ value: 0 }]);
  @nested @observable.ref refOtherSet1 = new Set([new Other()]);
  @nested @observable.ref refMap1 = new Map([["key1", 0]]);
  @nested @observable.ref refMap2 = new Map([["key1", { value: 0 }]]);
  @nested @observable.ref refOtherMap1 = new Map([["key1", new Other()]]);

  @nested.hoist @observable hoist1 = [0];

  constructor() {
    makeObservable(this);
  }
}

class Other {
  @observable number1 = 0;

  constructor() {
    makeObservable(this);
  }
}

/** Observe `fetcher.dataMap` in an autorun that is disposed when the test finishes */
function observeDataMap<T extends object>(fetcher: StandardNestedFetcher<T>) {
  const observer = { runs: 0, last: undefined as ReadonlyMap<KeyPath, T> | undefined };
  const dispose = autorun(() => {
    observer.last = fetcher.dataMap;
    observer.runs++;
  });
  onTestFinished(dispose);
  return observer;
}

/** Summarize entries as [key, keyPath, index of data in `objects`] */
function summarize(entries: Iterable<StandardNestedFetcher.Entry<any>>, objects: readonly unknown[]) {
  return Array.from(entries, (entry) => [entry.key, entry.keyPath, objects.indexOf(entry.data)]);
}

function firstOf<T>(set: Set<T>): T {
  return set.values().next().value as T;
}

describe("nested", () => {
  it("is a decorator with a hoist variant", () => {
    expect(typeof nested).toBe("function");
    expect(typeof nested.hoist).toBe("function");
    expect(nested.hoist).not.toBe(nested);
    expectTypeOf(nested).toBeFunction();
    expectTypeOf(nested.hoist).toBeFunction();
  });
});

describe("getNestedAnnotations", () => {
  it("returns all nested annotations", () => {
    const sample = new Sample();
    const map = new Map<
      string | symbol,
      {
        getValue: () => any;
        hoist: boolean;
      }
    >();
    for (const { key, getValue, hoist } of getNestedAnnotations(sample)) {
      map.set(key, { getValue, hoist });
    }

    expect(new Set(map.keys())).toMatchInlineSnapshot(`
      Set {
        Symbol(key1),
        "number1",
        "object1",
        "other1",
        "array1",
        "array2",
        "otherArray1",
        "set1",
        "set2",
        "otherSet1",
        "map1",
        "map2",
        "otherMap1",
        "boxedNumber1",
        "boxedObject1",
        "boxedOther1",
        "boxedArray1",
        "boxedArray2",
        "boxedOtherArray1",
        "boxedSet1",
        "boxedSet2",
        "boxedOtherSet1",
        "boxedMap1",
        "boxedMap2",
        "boxedOtherMap1",
        "refObject1",
        "refOther1",
        "refArray1",
        "refOtherArray1",
        "refSet1",
        "refSet2",
        "refOtherSet1",
        "refMap1",
        "refMap2",
        "refOtherMap1",
        "hoist1",
      }
    `);
    expect(map.size).toBe(36);

    for (const [key, { getValue, hoist }] of map) {
      expect(key in sample).toBe(true);
      expect(sample[key as keyof Sample]).toBe(getValue());
      expect(hoist).toBe(key === "hoist1");
    }
  });

  it("throws an error if mixed @nested annotations are found for the same key", () => {
    class Sample {
      @nested @nested.hoist hoist1 = [0];
    }
    const sample = new Sample();
    expect(() => Array.from(getNestedAnnotations(sample))).toThrow(/Mixed @nested/);
  });

  it("throws an error if mixed @nested annotations are found for the same key in the same inheritance chain", () => {
    class Parent {
      @nested.hoist hoist1 = [0];
    }
    class Sample extends Parent {
      @nested hoist1 = [0];
    }
    const sample = new Sample();
    expect(() => Array.from(getNestedAnnotations(sample))).toThrow(/Mixed @nested/);
  });

  it("throws an error if multiple @nested.hoist annotations are found in the same class", () => {
    class Sample {
      @nested.hoist hoist1 = [0];
      @nested.hoist hoist2 = [0];
    }
    const sample = new Sample();
    expect(() => Array.from(getNestedAnnotations(sample))).toThrow(/Multiple @nested.hoist/);
  });

  it("throws an error if multiple @nested.hoist annotations are found in the same inheritance chain", () => {
    class Parent {
      @nested.hoist hoist1 = [0];
    }
    class Sample extends Parent {
      @nested.hoist hoist2 = [0];
    }
    const sample = new Sample();
    expect(() => Array.from(getNestedAnnotations(sample))).toThrow(/Multiple @nested.hoist/);
  });

  it("yields nothing for objects without any annotations", () => {
    class Plain {
      field = [0];
    }
    expect(Array.from(getNestedAnnotations({}))).toEqual([]);
    expect(Array.from(getNestedAnnotations(new Plain()))).toEqual([]);
  });

  it("yields nothing for objects that only have other property-like annotations", () => {
    const other = createPropertyLikeAnnotation(Symbol("other"), () => true);
    class Sample {
      @other field = [0];
    }
    expect(Array.from(getNestedAnnotations(new Sample()))).toEqual([]);
  });

  it("yields keys in declaration order, inherited keys first, with an overridden key in its original position", () => {
    class Parent {
      @nested field1 = ["parent"];
      @nested field2 = ["parent"];
    }
    class Child extends Parent {
      @nested field3 = ["child"];
      @nested field1 = ["child"];
      @nested get getter1() {
        return ["getter"];
      }
    }

    const child = new Child();
    expect(Array.from(getNestedAnnotations(child), ({ key, hoist, getValue }) => [key, hoist, getValue()])).toEqual([
      ["field1", false, ["child"]],
      ["field2", false, ["parent"]],
      ["field3", false, ["child"]],
      ["getter1", false, ["getter"]],
    ]);

    // The parent class is not affected by the annotations of the child class
    expect(Array.from(getNestedAnnotations(new Parent()), ({ key }) => key)).toEqual(["field1", "field2"]);
  });

  it("yields a key once when the same annotation is applied twice", () => {
    class Sample {
      @nested @nested field1 = [0];
      @nested.hoist @nested.hoist field2 = [0];
    }
    expect(Array.from(getNestedAnnotations(new Sample()), ({ key, hoist }) => [key, hoist])).toEqual([
      ["field1", false],
      ["field2", true],
    ]);
  });

  it("returns a getValue that reads the current value on each call", () => {
    class Sample {
      @nested @observable field = [0];

      constructor() {
        makeObservable(this);
      }
    }
    const sample = new Sample();
    const [annotation] = Array.from(getNestedAnnotations(sample));
    const initial = sample.field;
    expect(annotation.getValue()).toBe(initial);

    runInAction(() => {
      sample.field = [1];
    });
    expect(annotation.getValue()).toBe(sample.field);
    expect(annotation.getValue()).not.toBe(initial);
  });

  it("returns a getValue that evaluates a getter on each call", () => {
    let count = 0;
    class Sample {
      @nested get field() {
        return [++count];
      }
    }
    const [annotation] = Array.from(getNestedAnnotations(new Sample()));
    expect(count).toBe(0);
    expect(annotation.getValue()).toEqual([1]);
    expect(annotation.getValue()).toEqual([2]);
  });

  it("returns a getValue that yields undefined once the key is removed from the target", () => {
    class Sample {
      @nested field?: number[] = [0];
    }
    const sample = new Sample();
    const [annotation] = Array.from(getNestedAnnotations(sample));
    delete sample.field;
    expect("field" in sample).toBe(false);
    expect(annotation.getValue()).toBeUndefined();
  });

  it("names the offending keys in error messages", () => {
    class Mixed {
      @nested @nested.hoist field1 = [0];
    }
    expect(() => Array.from(getNestedAnnotations(new Mixed()))).toThrow(
      new Error("Mixed @nested annotations are not allowed for the same key: field1")
    );

    const symbolKey = Symbol("mixed");
    class MixedSymbol {
      @nested @nested.hoist [symbolKey] = [0];
    }
    expect(() => Array.from(getNestedAnnotations(new MixedSymbol()))).toThrow(
      new Error("Mixed @nested annotations are not allowed for the same key: Symbol(mixed)")
    );

    class Multiple {
      @nested.hoist field1 = [0];
      @nested field2 = [0];
      @nested.hoist field3 = [0];
    }
    expect(() => Array.from(getNestedAnnotations(new Multiple()))).toThrow(
      new Error("Multiple @nested.hoist annotations are not allowed in the same class: field1 and field3")
    );
  });

  it("counts a hoisted symbol key towards the single @nested.hoist restriction", () => {
    const symbolKey = Symbol("hoisted");
    class Sample {
      @nested.hoist [symbolKey] = [0];
      @nested.hoist field = [0];
    }
    expect(() => Array.from(getNestedAnnotations(new Sample()))).toThrow(
      new Error("Multiple @nested.hoist annotations are not allowed in the same class: Symbol(hoisted) and field")
    );
  });

  it("validates lazily, yielding the keys that precede an invalid one before throwing", () => {
    class Sample {
      @nested field1 = [0];
      @nested.hoist field2 = [0];
      @nested.hoist field3 = [0];
    }
    const generator = getNestedAnnotations(new Sample()); // does not throw yet
    const yielded: (string | symbol)[] = [];
    expect(() => {
      for (const { key } of generator) {
        yielded.push(key);
      }
    }).toThrow(/Multiple @nested.hoist/);
    // PINNED(quirk): Invalid annotations are detected only when iteration reaches them, so the valid keys declared before them are yielded first and a consumer may already have acted on a partial list. Decide: should getNestedAnnotations validate all keys up front, before yielding anything?
    expect(yielded).toEqual(["field1", "field2"]);
  });

  it("has a typed signature", () => {
    expectTypeOf(getNestedAnnotations).parameters.toEqualTypeOf<[target: object]>();
    expectTypeOf(getNestedAnnotations).returns.toEqualTypeOf<
      Generator<{ key: string | symbol; getValue: () => any; hoist: boolean }>
    >();
  });
});

describe("StandardNestedFetcher", () => {
  describe("constructor", () => {
    it("throws eagerly for invalid annotations", () => {
      class Mixed {
        @nested @nested.hoist field = [0];
      }
      class MultipleHoist {
        @nested.hoist field1 = [0];
        @nested.hoist field2 = [0];
      }
      expect(() => new StandardNestedFetcher(new Mixed(), (entry) => entry.data)).toThrow(/Mixed @nested/);
      expect(() => new StandardNestedFetcher(new MultipleHoist(), (entry) => entry.data)).toThrow(
        /Multiple @nested.hoist/
      );
    });

    it("does not read values or call transform until iterated", () => {
      let reads = 0;
      class Sample {
        @nested get field() {
          reads++;
          return [new Other()];
        }
      }
      const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) => entry.data);
      const fetcher = new StandardNestedFetcher(new Sample(), transform);
      expect(reads).toBe(0);
      expect(transform).not.toHaveBeenCalled();

      const iterator = fetcher[Symbol.iterator]();
      expect(reads).toBe(0);
      expect(transform).not.toHaveBeenCalled();

      iterator.next();
      expect(reads).toBe(1);
      expect(transform).toHaveBeenCalledTimes(1);
    });

    it("yields nothing for a target without annotations", () => {
      const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) => entry.data);
      const fetcher = new StandardNestedFetcher({}, transform);
      expect(Array.from(fetcher)).toEqual([]);
      expect(Array.from(fetcher.getForKey(KeyPath.Self))).toEqual([]);
      expect(fetcher.dataMap).toEqual(new Map());
      expect(transform).not.toHaveBeenCalled();
    });

    it("ignores symbol keys, even when hoisted", () => {
      const symbolKey = Symbol("hoisted");
      class Sample {
        @nested.hoist [symbolKey] = [new Other()];
      }
      const sample = new Sample();
      expect(Array.from(getNestedAnnotations(sample), ({ key, hoist }) => [key, hoist])).toEqual([[symbolKey, true]]);

      const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
      // Documented ("Symbol keys are not supported"); Watcher likewise skips symbol keys before considering hoist
      expect(Array.from(fetcher)).toEqual([]);
      expect(Array.from(fetcher.getForKey(KeyPath.Self))).toEqual([]);
      expect(fetcher.dataMap.size).toBe(0);
    });

    it("infers the data type from the transform function", () => {
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) =>
        entry.data instanceof Other ? entry.data : null
      );
      expectTypeOf(fetcher).toEqualTypeOf<StandardNestedFetcher<Other>>();
      expectTypeOf(fetcher).toExtend<Iterable<StandardNestedFetcher.Entry<Other>>>();
      expectTypeOf(fetcher.dataMap).toEqualTypeOf<ReadonlyMap<KeyPath, Other>>();
      expectTypeOf(fetcher.getForKey).parameters.toEqualTypeOf<[keyPath: KeyPath]>();
      expectTypeOf(fetcher.getForKey("other1" as KeyPath)).toEqualTypeOf<
        Generator<StandardNestedFetcher.Entry<Other>, void, unknown>
      >();
      expectTypeOf<ConstructorParameters<typeof StandardNestedFetcher<Other>>>().toEqualTypeOf<
        [target: object, transform: (entry: StandardNestedFetcher.Entry<any>) => Other | null]
      >();
      expectTypeOf<StandardNestedFetcher.Entry<Other>>().toEqualTypeOf<{
        readonly key: KeyPath;
        readonly keyPath: KeyPath;
        readonly data: Other;
      }>();

      // @ts-expect-error -- the transformed data must be an object
      expect(() => new StandardNestedFetcher(new Sample(), () => 0)).not.toThrow();
    });
  });

  describe("iterator", () => {
    it("returns all nested entries except for symbol keys", () => {
      const sample = new Sample();
      const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);

      const map = new Map<KeyPath, any>();
      for (const entry of fetcher) {
        map.set(entry.keyPath, entry.data);
      }

      expect(map.get("number1" as KeyPath)).toEqual(sample.number1);
      expect(map.get("object1" as KeyPath)).toEqual(sample.object1);
      expect(map.get("other1" as KeyPath)).toEqual(sample.other1);
      expect(map.get("array1.0" as KeyPath)).toEqual(sample.array1[0]);
      expect(map.get("array2.0" as KeyPath)).toEqual(sample.array2[0]);
      expect(map.get("otherArray1.0" as KeyPath)).toEqual(sample.otherArray1[0]);
      expect(map.get("set1.0" as KeyPath)).toEqual(Array.from(sample.set1)[0]);
      expect(map.get("set2.0" as KeyPath)).toEqual(Array.from(sample.set2)[0]);
      expect(map.get("otherSet1.0" as KeyPath)).toEqual(Array.from(sample.otherSet1)[0]);
      expect(map.get("map1.key1" as KeyPath)).toEqual(sample.map1.get("key1"));
      expect(map.get("map2.key1" as KeyPath)).toEqual(sample.map2.get("key1"));
      expect(map.get("otherMap1.key1" as KeyPath)).toEqual(sample.otherMap1.get("key1"));

      expect(map.get("boxedNumber1" as KeyPath)).toEqual(sample.boxedNumber1.get());
      expect(map.get("boxedObject1" as KeyPath)).toEqual(sample.boxedObject1.get());
      expect(map.get("boxedOther1" as KeyPath)).toEqual(sample.boxedOther1.get());
      expect(map.get("boxedArray1.0" as KeyPath)).toEqual(sample.boxedArray1.get()[0]);
      expect(map.get("boxedArray2.0" as KeyPath)).toEqual(sample.boxedArray2.get()[0]);
      expect(map.get("boxedOtherArray1.0" as KeyPath)).toEqual(sample.boxedOtherArray1.get()[0]);
      expect(map.get("boxedSet1.0" as KeyPath)).toEqual(Array.from(sample.boxedSet1.get())[0]);
      expect(map.get("boxedSet2.0" as KeyPath)).toEqual(Array.from(sample.boxedSet2.get())[0]);
      expect(map.get("boxedOtherSet1.0" as KeyPath)).toEqual(Array.from(sample.boxedOtherSet1.get())[0]);
      expect(map.get("boxedMap1.key1" as KeyPath)).toEqual(sample.boxedMap1.get().get("key1"));
      expect(map.get("boxedMap2.key1" as KeyPath)).toEqual(sample.boxedMap2.get().get("key1"));
      expect(map.get("boxedOtherMap1.key1" as KeyPath)).toEqual(sample.boxedOtherMap1.get().get("key1"));

      expect(map.get("refObject1" as KeyPath)).toEqual(sample.refObject1);
      expect(map.get("refOther1" as KeyPath)).toEqual(sample.refOther1);
      expect(map.get("refArray1.0" as KeyPath)).toEqual(sample.refArray1[0]);
      expect(map.get("refOtherArray1.0" as KeyPath)).toEqual(sample.refOtherArray1[0]);
      expect(map.get("refSet1.0" as KeyPath)).toEqual(Array.from(sample.refSet1)[0]);
      expect(map.get("refSet2.0" as KeyPath)).toEqual(Array.from(sample.refSet2)[0]);
      expect(map.get("refOtherSet1.0" as KeyPath)).toEqual(Array.from(sample.refOtherSet1)[0]);
      expect(map.get("refMap1.key1" as KeyPath)).toEqual(sample.refMap1.get("key1"));
      expect(map.get("refMap2.key1" as KeyPath)).toEqual(sample.refMap2.get("key1"));
      expect(map.get("refOtherMap1.key1" as KeyPath)).toEqual(sample.refOtherMap1.get("key1"));

      expect(map.get("0" as KeyPath)).toEqual(sample.hoist1[0]); // "hoist1.0" lifted to "0"

      expect(map.size).toBe(37);
    });

    it("ignores null data", () => {
      const sample = new Sample();
      const fetcher = new StandardNestedFetcher(sample, (entry) => (entry.data instanceof Other ? entry.data : null));

      const map = new Map<KeyPath, any>();
      for (const entry of fetcher) {
        map.set(entry.keyPath, entry.data);
      }

      expect(new Set(map.keys())).toMatchInlineSnapshot(`
        Set {
          "other1",
          "otherArray1.0",
          "otherSet1.0",
          "otherMap1.key1",
          "boxedOther1",
          "boxedOtherArray1.0",
          "boxedOtherSet1.0",
          "boxedOtherMap1.key1",
          "refOther1",
          "refOtherArray1.0",
          "refOtherSet1.0",
          "refOtherMap1.key1",
        }
      `);
      expect(map.size).toBe(12);
    });

    it("yields entries in annotation order, then in collection order", () => {
      const objects = [new Other(), new Other(), new Other(), new Other()];
      class Sample {
        @nested @observable.shallow list = [objects[0], objects[1]];
        @nested @observable.shallow map = new Map([
          ["y", objects[2]],
          ["x", objects[0]],
        ]);
        @nested @observable.ref single = objects[3];

        constructor() {
          makeObservable(this);
        }
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      expect(summarize(fetcher, objects)).toEqual([
        ["list", "list.0", 0],
        ["list", "list.1", 1],
        ["map", "map.y", 2],
        ["map", "map.x", 0],
        ["single", "single", 3],
      ]);
    });

    it("calls transform with the raw entry and yields the transformed data in a new entry", () => {
      const other = new Other();
      class Sample {
        @nested field = other;
      }
      const received: StandardNestedFetcher.Entry<any>[] = [];
      const transformed = { transformed: true };
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => {
        received.push(entry);
        return transformed;
      });

      const entries = Array.from(fetcher);
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ key: "field", keyPath: "field", data: other });
      expect(received[0].data).toBe(other);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({ key: "field", keyPath: "field", data: transformed });
      expect(entries[0].data).toBe(transformed);
      expect(entries[0]).not.toBe(received[0]);
    });

    it("calls transform again on every iteration", () => {
      class Sample {
        @nested field = [new Other(), new Other()];
      }
      const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) => entry.data);
      const fetcher = new StandardNestedFetcher(new Sample(), transform);

      Array.from(fetcher);
      expect(transform).toHaveBeenCalledTimes(2);
      Array.from(fetcher);
      expect(transform).toHaveBeenCalledTimes(4);
    });

    it("skips entries for which transform returns null or undefined, but keeps other falsy values", () => {
      const results: Record<string, unknown> = { null: null, undefined: undefined, zero: 0, empty: "", false: false };
      class Sample {
        @nested field = Object.keys(results);
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => results[entry.data] as any);
      expect(Array.from(fetcher, (entry) => [entry.keyPath, entry.data])).toEqual([
        ["field.2", 0],
        ["field.3", ""],
        ["field.4", false],
      ]);
    });

    it("passes null and undefined values to transform as a single entry for the key", () => {
      class Sample {
        @nested @observable field1: Other | null = null;
        @nested @observable field2: Other | undefined = undefined;
        @nested field3 = observable.box<Other | null>(null);

        constructor() {
          makeObservable(this);
        }
      }
      const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) => entry.data);
      const fetcher = new StandardNestedFetcher(new Sample(), transform);
      expect(Array.from(fetcher)).toEqual([]);
      expect(transform.mock.calls.map(([entry]) => [entry.key, entry.keyPath, entry.data])).toEqual([
        ["field1", "field1", null],
        ["field2", "field2", undefined],
        ["field3", "field3", null],
      ]);
    });

    it("does not descend into objects, or into collections nested in a collection", () => {
      const inner = [new Other()];
      class Sample {
        @nested @observable.ref plainObject = { child: new Other() };
        @nested observableObject = observable({ child: new Other() });
        @nested @observable.shallow list = [inner];

        constructor() {
          makeObservable(this);
        }
      }
      const sample = new Sample();
      const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
      const entries = Array.from(fetcher);
      expect(entries.map((entry) => entry.keyPath)).toEqual(["plainObject", "observableObject", "list.0"]);
      expect(entries[0].data).toBe(sample.plainObject);
      expect(entries[1].data).toBe(sample.observableObject);
      expect(entries[2].data).toBe(inner);
    });

    it("passes holes in sparse arrays to transform as undefined", () => {
      const other = new Other();
      const sparse: Other[] = [];
      sparse[1] = other;
      class Sample {
        @nested field = sparse;
      }
      const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) => entry.data);
      const fetcher = new StandardNestedFetcher(new Sample(), transform);
      expect(Array.from(fetcher, (entry) => entry.keyPath)).toEqual(["field.1"]);
      expect(transform.mock.calls.map(([entry]) => [entry.keyPath, entry.data])).toEqual([
        ["field.0", undefined],
        ["field.1", other],
      ]);
    });

    it("indexes arrays and sets by position, so key paths shift when elements are removed", () => {
      const objects = [new Other(), new Other(), new Other()];
      class Sample {
        @nested @observable.shallow list = [...objects];
        @nested @observable.shallow set = new Set(objects);

        constructor() {
          makeObservable(this);
        }
      }
      const sample = new Sample();
      const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
      expect(summarize(fetcher, objects)).toEqual([
        ["list", "list.0", 0],
        ["list", "list.1", 1],
        ["list", "list.2", 2],
        ["set", "set.0", 0],
        ["set", "set.1", 1],
        ["set", "set.2", 2],
      ]);

      runInAction(() => {
        sample.list.splice(0, 1);
        sample.set.delete(objects[0]);
      });
      expect(summarize(fetcher, objects)).toEqual([
        ["list", "list.0", 1],
        ["list", "list.1", 2],
        ["set", "set.0", 1],
        ["set", "set.1", 2],
      ]);
    });

    it("uses string and number map keys as key path components and skips symbol map keys", () => {
      const objects = [new Other(), new Other(), new Other(), new Other()];
      class Sample {
        @nested @observable.shallow map = new Map<string | number | symbol, Other>([
          ["key", objects[0]],
          [0, objects[1]],
          [Symbol("key"), objects[2]],
          [42, objects[3]],
        ]);

        constructor() {
          makeObservable(this);
        }
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      expect(summarize(fetcher, objects)).toEqual([
        ["map", "map.key", 0],
        ["map", "map.0", 1],
        ["map", "map.42", 3],
      ]);
    });

    it("joins string map keys verbatim, so distinct keys can produce identical or ambiguous key paths", () => {
      const objects = [new Other(), new Other(), new Other(), new Other()];
      class Sample {
        @nested @observable.shallow map = new Map<string | number, Other>([
          [1, objects[0]],
          ["1", objects[1]],
          ["a.b", objects[2]],
          ["", objects[3]],
        ]);

        constructor() {
          makeObservable(this);
        }
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      // PINNED(quirk): The number key 1 and the string key "1" both become "map.1", the key "a.b" reads as a deeper path, and the empty key "" collapses onto the property's own key path "map"; dataMap keeps only the last of the colliding entries. Decide: should map keys that cannot round-trip through a key path be escaped or rejected?
      expect(summarize(fetcher, objects)).toEqual([
        ["map", "map.1", 0],
        ["map", "map.1", 1],
        ["map", "map.a.b", 2],
        ["map", "map", 3],
      ]);
      expect(fetcher.dataMap.size).toBe(3);
      expect(fetcher.dataMap.get("map.1" as KeyPath)).toBe(objects[1]);
    });

    it("skips map keys that have no key path form, while a null key takes the property key path", () => {
      const objects = [new Other(), new Other(), new Other(), new Other(), new Other()];
      class Sample {
        @nested @observable.shallow map = new Map<unknown, Other>([
          [{}, objects[0]],
          [true, objects[1]],
          [null, objects[2]],
          [undefined, objects[3]],
          ["key", objects[4]],
        ]);

        constructor() {
          makeObservable(this);
        }
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      // The object, boolean and undefined keys are ignored, as symbol keys are; `null` marks a value that is not a
      // collection, so that entry keeps the key path of the property itself
      expect(summarize(fetcher, objects)).toEqual([
        ["map", "map", 2],
        ["map", "map.key", 4],
      ]);
      expect(fetcher.dataMap.size).toBe(2);
      expect(fetcher.dataMap.get("map" as KeyPath)).toBe(objects[2]);
    });

    it("yields cyclic references as they are without recursing", () => {
      class Sample {
        @nested @observable.ref self: Sample | null = null;
        @nested @observable.shallow list: Sample[] = [];

        constructor() {
          makeObservable(this);
        }
      }
      const sample = new Sample();
      runInAction(() => {
        sample.self = sample;
        sample.list.push(sample, sample);
      });
      const entries = Array.from(new StandardNestedFetcher(sample, (entry) => entry.data));
      expect(entries.map((entry) => entry.keyPath)).toEqual(["self", "list.0", "list.1"]);
      for (const entry of entries) {
        expect(entry.data).toBe(sample);
      }
    });

    it("reads getters, including computed ones, on each iteration", () => {
      class Sample {
        @observable.shallow source = [new Other()];

        @nested get plainGetter() {
          return this.source.slice();
        }

        @nested @computed get computedGetter() {
          return this.source.slice(0, 1);
        }

        constructor() {
          makeObservable(this);
        }
      }
      const sample = new Sample();
      const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
      expect(Array.from(fetcher, (entry) => entry.keyPath)).toEqual(["plainGetter.0", "computedGetter.0"]);

      runInAction(() => {
        sample.source.push(new Other());
      });
      expect(Array.from(fetcher, (entry) => entry.keyPath)).toEqual([
        "plainGetter.0",
        "plainGetter.1",
        "computedGetter.0",
      ]);
    });

    it("unwraps the current value of a boxed observable on each iteration", () => {
      const objects = [new Other(), new Other()];
      class Sample {
        @nested field = observable.box<Other[] | Other | null>([objects[0]], { deep: false });
      }
      const sample = new Sample();
      const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
      expect(summarize(fetcher, objects)).toEqual([["field", "field.0", 0]]);

      runInAction(() => {
        sample.field.set(objects[1]);
      });
      expect(summarize(fetcher, objects)).toEqual([["field", "field", 1]]);

      runInAction(() => {
        sample.field.set(null);
      });
      expect(summarize(fetcher, objects)).toEqual([]);
    });

    describe("@nested.hoist", () => {
      it("uses KeyPath.Self as both the key and the key path for a hoisted non-collection value", () => {
        const other = new Other();
        class Sample {
          @nested.hoist field = other;
        }
        const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
        const entries = Array.from(fetcher);
        expect(entries).toHaveLength(1);
        expect(entries[0].key).toBe(KeyPath.Self);
        expect(entries[0].keyPath).toBe(KeyPath.Self);
        expect(entries[0].data).toBe(other);
      });

      it("uses map keys and indices directly as key paths for hoisted collections", () => {
        const objects = [new Other(), new Other()];
        class ListSample {
          @nested.hoist list = [...objects];
        }
        class MapSample {
          @nested.hoist map = new Map([
            ["a", objects[0]],
            ["b", objects[1]],
          ]);
        }
        expect(summarize(new StandardNestedFetcher(new ListSample(), (entry) => entry.data), objects)).toEqual([
          [KeyPath.Self, "0", 0],
          [KeyPath.Self, "1", 1],
        ]);
        expect(summarize(new StandardNestedFetcher(new MapSample(), (entry) => entry.data), objects)).toEqual([
          [KeyPath.Self, "a", 0],
          [KeyPath.Self, "b", 1],
        ]);
      });

      it("lets a hoisted entry share a key path with a sibling key, and dataMap keeps the one declared later", () => {
        const objects = [new Other(), new Other()];
        class Sample {
          @nested child = objects[0];
          @nested.hoist map = new Map([["child", objects[1]]]);
        }
        const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
        expect(summarize(fetcher, objects)).toEqual([
          ["child", "child", 0],
          [KeyPath.Self, "child", 1],
        ]);
        // PINNED(quirk): Both entries have the key path "child", so the hoisted entry silently shadows the sibling property in dataMap. Decide: should collisions between hoisted and regular key paths be detected and reported?
        expect(fetcher.dataMap.size).toBe(1);
        expect(fetcher.dataMap.get("child" as KeyPath)).toBe(objects[1]);
      });
    });

    it("propagates errors thrown by transform", () => {
      class Sample {
        @nested field = [new Other()];
      }
      const error = new Error("transform failed");
      const fetcher = new StandardNestedFetcher(new Sample(), () => {
        throw error;
      });
      expect(() => Array.from(fetcher)).toThrow(error);
      expect(() => Array.from(fetcher.getForKey("field" as KeyPath))).toThrow(error);
      expect(() => fetcher.dataMap).toThrow(error);
    });
  });

  describe("#getForKey", () => {
    it("returns nested entries for a given key", () => {
      const sample = new Sample();
      const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
      const entries = fetcher.getForKey("other1" as KeyPath);
      expect(Array.from(entries)).toEqual([
        {
          key: "other1",
          keyPath: "other1",
          data: sample.other1,
        },
      ]);
    });

    it("returns entries for every element of a collection key, in order, skipping null results", () => {
      const objects = [new Other(), new Other(), new Other()];
      class Sample {
        @nested list = [objects[0], null, objects[1]];
        @nested other = objects[2];
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      expect(summarize(fetcher.getForKey("list" as KeyPath), objects)).toEqual([
        ["list", "list.0", 0],
        ["list", "list.2", 1],
      ]);
    });

    it("returns nothing for unknown keys, deeper key paths, and KeyPath.Self without a hoisted key", () => {
      class Sample {
        @nested list = [new Other()];
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      expect(Array.from(fetcher.getForKey("unknown" as KeyPath))).toEqual([]);
      expect(Array.from(fetcher.getForKey("list.0" as KeyPath))).toEqual([]);
      expect(Array.from(fetcher.getForKey(KeyPath.Self))).toEqual([]);
    });

    it("returns hoisted entries for KeyPath.Self rather than for the property name", () => {
      const objects = [new Other(), new Other(), new Other()];
      class Sample {
        @nested.hoist list = [objects[0], objects[1]];
        @nested other = objects[2];
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      expect(summarize(fetcher.getForKey(KeyPath.Self), objects)).toEqual([
        [KeyPath.Self, "0", 0],
        [KeyPath.Self, "1", 1],
      ]);
      expect(Array.from(fetcher.getForKey("list" as KeyPath))).toEqual([]);
      expect(summarize(fetcher.getForKey("other" as KeyPath), objects)).toEqual([["other", "other", 2]]);

      expect(KeyPath.isSelf("" as KeyPath)).toBe(true);
      // PINNED(quirk): KeyPath.isSelf treats "" as a self path, but getForKey("") does not resolve to the hoisted key. Decide: should getForKey normalize self paths ("") to KeyPath.Self?
      expect(Array.from(fetcher.getForKey("" as KeyPath))).toHaveLength(0);
    });

    it("does not call transform until iterated", () => {
      class Sample {
        @nested list = [new Other(), new Other()];
      }
      const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) => entry.data);
      const fetcher = new StandardNestedFetcher(new Sample(), transform);
      const iterator = fetcher.getForKey("list" as KeyPath);
      expect(transform).not.toHaveBeenCalled();
      iterator.next();
      expect(transform).toHaveBeenCalledTimes(1);
    });
  });

  describe("#dataMap", () => {
    let idCounter = 0;
    const cache = new WeakMap<object, { id: number }>();
    const createData = (object: object) => {
      let data = cache.get(object);
      if (!data) {
        const id = ++idCounter;
        data = {} as { id: number };
        Object.defineProperty(data, "id", {
          get() {
            return id;
          },
        });
        cache.set(object, data);
      }
      return data;
    };

    it("is a computed property with an identity equality of its entries", async () => {
      const sample = new Sample();
      const fetcher = new StandardNestedFetcher(sample, (entry) => {
        if (entry.key === "otherArray1" && typeof entry.data === "object") {
          return createData(entry.data);
        }
        return null;
      });

      let observeCount = 0;
      const dispose = autorun(() => {
        void fetcher.dataMap;
        observeCount++;
      });
      onTestFinished(dispose);

      const data1 = fetcher.dataMap.get("otherArray1.0" as KeyPath)!;
      expect(Object.keys(data1)).toEqual([]);
      expect(data1.id).toEqual(1);
      expect(observeCount).toBe(1);

      runInAction(() => {
        const last = sample.otherArray1.pop();
        sample.otherArray1.push(last!);
      });
      expect(observeCount).toBe(1);

      runInAction(() => {
        sample.otherArray1[0] = new Other();
      });
      const data2 = fetcher.dataMap.get("otherArray1.0" as KeyPath)!;
      expect(Object.keys(data2)).toEqual([]);
      expect(data2.id).toEqual(2);
      expect(observeCount).toBe(2);
    });

    it("maps key paths to transformed data in iteration order", () => {
      const objects = [new Other(), new Other(), new Other()];
      class Sample {
        @nested list = [objects[0], objects[1]];
        @nested.hoist single = objects[2];
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      expect(Array.from(fetcher.dataMap, ([keyPath, data]) => [keyPath, objects.indexOf(data)])).toEqual([
        ["list.0", 0],
        ["list.1", 1],
        [KeyPath.Self, 2],
      ]);
    });

    it("returns a new map on each read while unobserved, and the cached map while observed", () => {
      class Sample {
        @nested list = [new Other()];
      }
      const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
      // Standard MobX semantics: a computed read outside of a reactive context is not cached
      expect(fetcher.dataMap).not.toBe(fetcher.dataMap);
      expect(fetcher.dataMap).toEqual(fetcher.dataMap);

      const observer = observeDataMap(fetcher);
      expect(fetcher.dataMap).toBe(observer.last);
      expect(fetcher.dataMap).toBe(fetcher.dataMap);
    });

    describe("reactivity", () => {
      class Model {
        @nested @observable.shallow list = [new Other(), new Other()];
        @nested @observable.shallow map = new Map([
          ["a", new Other()],
          ["b", new Other()],
        ]);
        @nested @observable.shallow set = new Set([new Other(), new Other()]);
        @nested @observable.ref child = new Other();
        @nested boxed = observable.box([new Other()]);
        @observable unrelated = 0;

        constructor() {
          makeObservable(this);
        }
      }

      const setUp = () => {
        const model = new Model();
        const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) =>
          entry.data instanceof Other ? entry.data : null
        );
        const fetcher = new StandardNestedFetcher(model, transform);
        const observer = observeDataMap(fetcher);
        expect(observer.runs).toBe(1);
        expect(observer.last!.size).toBe(8);
        return { model, transform, fetcher, observer };
      };

      const expectInSync = (fetcher: StandardNestedFetcher<Other>, dataMap: ReadonlyMap<KeyPath, Other>) => {
        const entries = Array.from(fetcher);
        expect(Array.from(dataMap.keys())).toEqual(entries.map((entry) => entry.keyPath));
        for (const entry of entries) {
          expect(dataMap.get(entry.keyPath)).toBe(entry.data);
        }
      };

      const notifying: [name: string, mutate: (model: Model) => void][] = [
        ["pushing to an array", (model) => model.list.push(new Other())],
        ["removing from an array", (model) => model.list.pop()],
        ["reordering an array", (model) => model.list.reverse()],
        [
          "replacing an array element",
          (model) => {
            model.list[0] = new Other();
          },
        ],
        ["adding a map entry", (model) => model.map.set("c", new Other())],
        ["deleting a map entry", (model) => model.map.delete("a")],
        [
          "re-inserting a map entry, which moves it to the end",
          (model) => {
            const value = model.map.get("a")!;
            model.map.delete("a");
            model.map.set("a", value);
          },
        ],
        ["adding a set element", (model) => model.set.add(new Other())],
        ["deleting a set element", (model) => model.set.delete(firstOf(model.set))],
        [
          "reassigning an observable property",
          (model) => {
            model.child = new Other();
          },
        ],
        ["pushing to a boxed observable array", (model) => model.boxed.get().push(new Other())],
        ["setting a boxed observable", (model) => model.boxed.set([])],
      ];

      it.each(notifying)("notifies observers after %s", (_, mutate) => {
        const { model, fetcher, observer } = setUp();
        const previous = observer.last;
        runInAction(() => mutate(model));
        expect(observer.runs).toBe(2);
        expect(observer.last).not.toBe(previous);
        expectInSync(fetcher, observer.last!);
      });

      const silent: [name: string, mutate: (model: Model) => void][] = [
        [
          "replacing an array with one holding the same elements",
          (model) => {
            model.list = model.list.slice();
          },
        ],
        ["removing and re-adding the last array element", (model) => model.list.push(model.list.pop()!)],
        ["setting a map entry to its current value", (model) => model.map.set("a", model.map.get("a")!)],
        ["adding an existing set element", (model) => model.set.add(firstOf(model.set))],
        [
          "changing properties of nested objects",
          (model) => {
            model.list[0].number1++;
            model.child.number1++;
          },
        ],
        [
          "changing an unrelated observable",
          (model) => {
            model.unrelated++;
          },
        ],
      ];

      it.each(silent)("does not notify observers after %s", (_, mutate) => {
        const { model, fetcher, observer } = setUp();
        const previous = observer.last;
        runInAction(() => mutate(model));
        expect(observer.runs).toBe(1);
        expect(observer.last).toBe(previous);
        expectInSync(fetcher, observer.last!);
      });

      it("keeps the previous map when a re-computation produces a shallowly equal map", () => {
        const { model, transform, fetcher, observer } = setUp();
        const previous = fetcher.dataMap;
        const callsBefore = transform.mock.calls.length;

        runInAction(() => {
          model.list = model.list.slice();
        });
        expect(transform.mock.calls.length).toBe(callsBefore + 8); // re-computed over all 8 entries
        expect(observer.runs).toBe(1);
        expect(fetcher.dataMap).toBe(previous);
      });

      it("re-computes when an observable read by transform changes", () => {
        const model = new Model();
        const enabled = observable.box(true);
        const fetcher = new StandardNestedFetcher(model, (entry) =>
          enabled.get() && entry.data instanceof Other ? entry.data : null
        );
        const observer = observeDataMap(fetcher);
        expect(observer.last!.size).toBe(8);

        runInAction(() => enabled.set(false));
        expect(observer.runs).toBe(2);
        expect(observer.last!.size).toBe(0);
      });

      it("does not notify observers of structural changes when transform filters out every entry", () => {
        const model = new Model();
        const fetcher = new StandardNestedFetcher(model, () => null);
        const observer = observeDataMap(fetcher);

        runInAction(() => {
          model.list.push(new Other());
          model.map.set("c", new Other());
        });
        expect(observer.runs).toBe(1);
        expect(observer.last!.size).toBe(0);
      });

      it("does not see in-place mutations of non-observable collections while observed", () => {
        class Sample {
          @nested @observable.ref refList = [new Other()];
          @nested readonly plainList = [new Other()];

          constructor() {
            makeObservable(this);
          }
        }
        const sample = new Sample();
        const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
        const observer = observeDataMap(fetcher);
        expect(observer.last!.size).toBe(2);

        runInAction(() => {
          sample.refList.push(new Other());
          sample.plainList.push(new Other());
        });
        expect(Array.from(fetcher)).toHaveLength(4);
        // Standard MobX semantics: plain arrays held by @observable.ref or unannotated properties are not observable,
        // so the cached dataMap stays stale (the docs pair @nested collections with @observable)
        expect(observer.runs).toBe(1);
        expect(fetcher.dataMap.size).toBe(2);
      });

      it("does not see reassignment of a property without @observable while observed", () => {
        // Documented: "For mutable properties, combine with @observable"
        class Sample {
          @nested child = new Other();
        }
        const sample = new Sample();
        const initial = sample.child;
        const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
        const observer = observeDataMap(fetcher);

        sample.child = new Other();
        expect(Array.from(fetcher, (entry) => entry.data)).toEqual([sample.child]);
        expect(observer.runs).toBe(1);
        expect(fetcher.dataMap.get("child" as KeyPath)).toBe(initial);
      });
    });
  });
});

describe("getNestedAnnotations (edge cases)", () => {
  it("allows a subclass to re-declare an inherited hoisted key with @nested.hoist", () => {
    class Parent {
      @nested.hoist list = ["parent"];
    }
    class Child extends Parent {
      @nested.hoist list = ["child"];
    }
    expect(
      Array.from(getNestedAnnotations(new Child()), ({ key, hoist, getValue }) => [key, hoist, getValue()])
    ).toEqual([["list", true, ["child"]]]);
  });

  it("keeps an inherited annotation when a subclass overrides the property without @nested", () => {
    class Parent {
      @nested field = ["parent"];
    }
    class Child extends Parent {
      override field = ["child"];
    }
    expect(
      Array.from(getNestedAnnotations(new Child()), ({ key, hoist, getValue }) => [key, hoist, getValue()])
    ).toEqual([["field", false, ["child"]]]);
  });

  it("counts a hoisted key named with an empty string towards the single @nested.hoist restriction", () => {
    const objects = [new Other(), new Other()];
    class Sample {
      @nested.hoist "" = [objects[0]];
      @nested.hoist list = [objects[1]];
    }
    expect(() => Array.from(getNestedAnnotations(new Sample()))).toThrow(
      new Error("Multiple @nested.hoist annotations are not allowed in the same class:  and list")
    );
    // Both keys would resolve to KeyPath.Self, so the fetcher rejects them instead of dropping one
    expect(() => new StandardNestedFetcher(new Sample(), (entry) => entry.data)).toThrow(/Multiple @nested.hoist/);
  });
});

describe("StandardNestedFetcher (edge cases)", () => {
  it("ignores symbol keys that are not hoisted", () => {
    const symbolKey = Symbol("plain");
    class Sample {
      @nested [symbolKey] = [new Other()];
      @nested field = new Other();
    }
    const sample = new Sample();
    expect(Array.from(getNestedAnnotations(sample), ({ key, hoist }) => [key, hoist])).toEqual([
      [symbolKey, false],
      ["field", false],
    ]);

    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    expect(Array.from(fetcher, (entry) => entry.keyPath)).toEqual(["field"]);
    expect(Array.from(fetcher.getForKey(KeyPath.Self))).toEqual([]);
    expect(Array.from(fetcher.dataMap.keys())).toEqual(["field"]);
  });

  it("resolves annotations once, at construction", () => {
    const applyNested = nested as unknown as (target: object, propertyKey: string) => void;
    const target = { field: [new Other()] };
    const fetcher = new StandardNestedFetcher(target, (entry) => entry.data);

    applyNested(target, "field");
    expect(Array.from(getNestedAnnotations(target), ({ key }) => key)).toEqual(["field"]);
    // Annotations registered after construction are not picked up by an existing fetcher...
    expect(Array.from(fetcher)).toEqual([]);
    expect(fetcher.dataMap.size).toBe(0);
    // ...but a fetcher constructed afterwards sees them
    expect(Array.from(new StandardNestedFetcher(target, (entry) => entry.data), (entry) => entry.keyPath)).toEqual([
      "field.0",
    ]);
  });

  it("treats a property named with an empty string as if it were hoisted", () => {
    const objects = [new Other(), new Other()];
    class Sample {
      @nested "" = [objects[0]];
      @nested other = objects[1];
    }
    const sample = new Sample();
    expect(Array.from(getNestedAnnotations(sample), ({ key, hoist }) => [key, hoist])).toEqual([
      ["", false],
      ["other", false],
    ]);

    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    // PINNED(quirk): KeyPath.build("") returns KeyPath.Self, so the non-hoisted key "" yields entries keyed by KeyPath.Self with key paths like "0", exactly like @nested.hoist. Decide: should an empty property name be rejected, or kept distinguishable from a hoisted key?
    expect(summarize(fetcher, objects)).toEqual([
      [KeyPath.Self, "0", 0],
      ["other", "other", 1],
    ]);
    expect(Array.from(fetcher.getForKey(KeyPath.Self))).toHaveLength(1);
  });

  it("fetches a hoisted key alongside a property named with an empty string, in the position of the latter", () => {
    const objects = [new Other(), new Other(), new Other()];
    class Sample {
      @nested "" = [objects[0]];
      @nested other = objects[1];
      @nested.hoist list = [objects[2]];
    }
    const fetcher = new StandardNestedFetcher(new Sample(), (entry) => entry.data);
    // PINNED(quirk): Both "" and the hoisted "list" resolve to KeyPath.Self, so both are fetched under it and are yielded together, before "other"; their elements share the key path "0" and dataMap keeps only the last. Decide: should key collisions on KeyPath.Self throw at construction?
    expect(summarize(fetcher, objects)).toEqual([
      [KeyPath.Self, "0", 0],
      [KeyPath.Self, "0", 2],
      ["other", "other", 1],
    ]);
    expect(fetcher.dataMap.get("0" as KeyPath)).toBe(objects[2]);
  });

  it("stops reading values and calling transform when iteration is abandoned early", () => {
    const reads = { first: 0, second: 0 };
    class Sample {
      @nested get first() {
        reads.first++;
        return [new Other(), new Other()];
      }
      @nested get second() {
        reads.second++;
        return [new Other()];
      }
    }
    const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) => entry.data);
    const fetcher = new StandardNestedFetcher(new Sample(), transform);

    for (const entry of fetcher) {
      expect(entry.keyPath).toBe("first.0");
      break;
    }
    expect(reads).toEqual({ first: 1, second: 0 });
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it("getForKey reads only the value of the requested key", () => {
    const reads = { first: 0, second: 0 };
    class Sample {
      @nested get first() {
        reads.first++;
        return [new Other()];
      }
      @nested get second() {
        reads.second++;
        return [new Other(), new Other()];
      }
    }
    const transform = vi.fn((entry: StandardNestedFetcher.Entry<any>) => entry.data);
    const fetcher = new StandardNestedFetcher(new Sample(), transform);

    expect(Array.from(fetcher.getForKey("second" as KeyPath), (entry) => entry.keyPath)).toEqual([
      "second.0",
      "second.1",
    ]);
    expect(reads).toEqual({ first: 0, second: 1 });
    expect(transform.mock.calls.map(([entry]) => entry.key)).toEqual(["second", "second"]);
  });

  it("getForKey subscribes a reaction only to the requested key", () => {
    class Sample {
      @nested @observable.shallow list = [new Other()];
      @nested @observable.shallow map = new Map([["a", new Other()]]);

      constructor() {
        makeObservable(this);
      }
    }
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    let runs = 0;
    let keyPaths: KeyPath[] = [];
    const dispose = autorun(() => {
      keyPaths = Array.from(fetcher.getForKey("list" as KeyPath), (entry) => entry.keyPath);
      runs++;
    });
    onTestFinished(dispose);
    expect(runs).toBe(1);

    runInAction(() => sample.map.set("b", new Other()));
    expect(runs).toBe(1);

    runInAction(() => sample.list.push(new Other()));
    expect(runs).toBe(2);
    expect(keyPaths).toEqual(["list.0", "list.1"]);
  });

  it("keeps separate state for fetchers created over the same target", () => {
    class Sample {
      @nested @observable.shallow list: (Other | null)[] = [new Other(), null];

      constructor() {
        makeObservable(this);
      }
    }
    const sample = new Sample();
    const all = new StandardNestedFetcher(sample, (entry) => ({ value: entry.data }));
    const others = new StandardNestedFetcher(sample, (entry) => (entry.data instanceof Other ? entry.data : null));
    const observer = observeDataMap(others);
    expect(Array.from(all.dataMap.keys())).toEqual(["list.0", "list.1"]);
    expect(Array.from(observer.last!.keys())).toEqual(["list.0"]);

    runInAction(() => sample.list.push(new Other()));
    expect(observer.runs).toBe(2);
    expect(Array.from(observer.last!.keys())).toEqual(["list.0", "list.2"]);
    expect(Array.from(all.dataMap.keys())).toEqual(["list.0", "list.1", "list.2"]);
  });

  it("catches up with in-place mutations of a non-observable collection once dataMap is no longer observed", () => {
    class Sample {
      @nested readonly list = [new Other()];
    }
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);

    // create → observe → mutate: stale while observed
    let runs = 0;
    let dispose = autorun(() => {
      void fetcher.dataMap;
      runs++;
    });
    const disposeFirst = dispose;
    onTestFinished(() => disposeFirst()); // disposing twice is a no-op
    sample.list.push(new Other());
    expect(runs).toBe(1);
    expect(fetcher.dataMap.size).toBe(1);

    // dispose: the next read re-computes
    dispose();
    expect(fetcher.dataMap.size).toBe(2);

    // re-observe: starts from the fresh value, then goes stale again
    dispose = autorun(() => {
      void fetcher.dataMap;
      runs++;
    });
    onTestFinished(() => dispose());
    expect(runs).toBe(2);
    expect(fetcher.dataMap.size).toBe(2);
    sample.list.push(new Other());
    expect(runs).toBe(2);
    expect(fetcher.dataMap.size).toBe(2);
  });

  it("notifies observers when a hoisted observable collection changes", () => {
    class Sample {
      @nested.hoist @observable.shallow list = [new Other()];

      constructor() {
        makeObservable(this);
      }
    }
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    const observer = observeDataMap(fetcher);
    expect(Array.from(observer.last!.keys())).toEqual(["0"]);

    runInAction(() => sample.list.push(new Other()));
    expect(observer.runs).toBe(2);
    expect(Array.from(observer.last!.keys())).toEqual(["0", "1"]);

    runInAction(() => {
      sample.list = [];
    });
    expect(observer.runs).toBe(3);
    expect(observer.last!.size).toBe(0);
  });

  it("sees annotations of subclasses from a fetcher created in a base-class constructor", () => {
    // Stage-2 annotations live on the prototype chain, so they are resolvable before subclass fields are initialized
    // (compare with test-stage3/nested.test.ts, where the same setup misses the subclass annotations)
    class Base {
      readonly fetcher: StandardNestedFetcher<Other>;
      @nested base = [new Other()];

      constructor() {
        this.fetcher = new StandardNestedFetcher(this, (entry) => entry.data);
      }
    }
    class Derived extends Base {
      @nested derived = [new Other()];
    }
    const derived = new Derived();
    expect(Array.from(derived.fetcher, (entry) => entry.keyPath)).toEqual(["base.0", "derived.0"]);
  });

  it("re-runs a dataMap observer when an observable read by transform changes, as in the documented example", () => {
    // Mirrors the "StandardNestedFetcher (low-level API)" example in the docs
    class Item {
      @observable id: number;
      @observable name: string;

      constructor(id: number, name: string) {
        this.id = id;
        this.name = name;
        makeObservable(this);
      }

      toString() {
        return `Item(id = ${this.id}, name = ${this.name})`;
      }
    }
    class Parent {
      @nested @observable items = [new Item(1, "First"), new Item(2, "Second")];

      constructor() {
        makeObservable(this);
      }
    }
    const parent = new Parent();
    // The documented example returns strings, which only type-checks with an explicit type argument (T extends object)
    const fetcher = new StandardNestedFetcher<any>(parent, (entry) =>
      entry.data instanceof Item ? entry.data.toString() : null
    );
    const observer = observeDataMap(fetcher);
    expect(Array.from(observer.last!)).toEqual([
      ["items.0", "Item(id = 1, name = First)"],
      ["items.1", "Item(id = 2, name = Second)"],
    ]);

    // The docs: "autorun triggers because the array structure changed"
    runInAction(() => parent.items.push(new Item(3, "Third")));
    expect(observer.runs).toBe(2);
    expect(observer.last!.size).toBe(3);

    runInAction(() => {
      parent.items[0].name = "Updated";
    });
    // transform runs inside the dataMap computed, so the observables it reads (id and name, via toString) are tracked,
    // and the item change produces a different value at "items.0"
    expect(observer.runs).toBe(3);
    expect(observer.last!.get("items.0" as KeyPath)).toBe("Item(id = 1, name = Updated)");
  });
});
