// biome-ignore-all lint/plugin/mobxMissingMakeObservable: stage-3 decorators need no makeObservable(this)
import { autorun, computed, observable, runInAction } from "mobx";
import { onTestFinished } from "vitest";
import { KeyPath } from "../src/keyPath";
import { getNestedAnnotations, nested, StandardNestedFetcher } from "../src/nested";

class Other {
  @observable accessor value = 0;
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

describe("getNestedAnnotations", () => {
  class Sample {
    @nested field1 = [new Other()];
    @nested accessor accessor1 = [new Other()];
    @nested get getter1() {
      return [this.#privateField1];
    }
    @nested #privateField1 = new Other();
    @nested accessor #privateAccessor1 = [new Other()];
    @nested get #privateGetter1() {
      return [this.#privateField1];
    }

    replacePrivateField() {
      this.#privateField1 = new Other();
    }

    readPrivate() {
      return {
        field: this.#privateField1,
        accessor: this.#privateAccessor1,
        getter: this.#privateGetter1,
      };
    }
  }

  test("collects fields, accessors, getters and ECMAScript private members", () => {
    const sample = new Sample();
    // Stage-3 initializers of getters run before those of fields and accessors
    expect(Array.from(getNestedAnnotations(sample), ({ key, hoist }) => [key, hoist])).toEqual([
      ["getter1", false],
      ["#privateGetter1", false],
      ["field1", false],
      ["accessor1", false],
      ["#privateField1", false],
      ["#privateAccessor1", false],
    ]);
  });

  test("getValue reads private members through the decorator context", () => {
    const sample = new Sample();
    const annotations = new Map(Array.from(getNestedAnnotations(sample), (a) => [a.key, a]));
    const privates = sample.readPrivate();

    expect("#privateField1" in sample).toBe(false);
    expect(annotations.get("#privateField1")!.getValue()).toBe(privates.field);
    expect(annotations.get("#privateAccessor1")!.getValue()).toBe(privates.accessor);
    expect(annotations.get("#privateGetter1")!.getValue()).toEqual([privates.field]);
    expect(annotations.get("field1")!.getValue()).toBe(sample.field1);
    expect(annotations.get("accessor1")!.getValue()).toBe(sample.accessor1);

    sample.replacePrivateField();
    expect(annotations.get("#privateField1")!.getValue()).toBe(sample.readPrivate().field);
    expect(annotations.get("#privateField1")!.getValue()).not.toBe(privates.field);
  });

  test("annotations are registered per instance and do not accumulate", () => {
    const sample1 = new Sample();
    const sample2 = new Sample();
    const annotations1 = Array.from(getNestedAnnotations(sample1));
    const annotations2 = Array.from(getNestedAnnotations(sample2));
    expect(annotations1).toHaveLength(6);
    expect(annotations2).toHaveLength(6);
    expect(annotations1.find((a) => a.key === "field1")!.getValue()).toBe(sample1.field1);
    expect(annotations2.find((a) => a.key === "field1")!.getValue()).toBe(sample2.field1);
  });

  test("inherited keys come first and an overridden key is yielded once", () => {
    class Parent {
      @nested field1 = [new Other()];
    }
    class Child extends Parent {
      @nested field2 = [new Other()];
      @nested.hoist field3 = [new Other()];
    }
    class Override extends Parent {
      @nested field1 = [new Other()];
    }
    expect(Array.from(getNestedAnnotations(new Child()), ({ key, hoist }) => [key, hoist])).toEqual([
      ["field1", false],
      ["field2", false],
      ["field3", true],
    ]);
    expect(Array.from(getNestedAnnotations(new Parent()), ({ key }) => key)).toEqual(["field1"]);
    expect(Array.from(getNestedAnnotations(new Override()), ({ key }) => key)).toEqual(["field1"]);
  });

  test("throws for mixed annotations and for multiple hoisted keys", () => {
    class Mixed {
      @nested @nested.hoist field1 = [new Other()];
    }
    class Parent {
      @nested.hoist accessor #hoisted1 = [new Other()];
      readHoisted() {
        return this.#hoisted1;
      }
    }
    class MultipleHoist extends Parent {
      @nested.hoist field2 = [new Other()];
    }
    expect(() => Array.from(getNestedAnnotations(new Mixed()))).toThrow(
      new Error("Mixed @nested annotations are not allowed for the same key: field1")
    );
    expect(() => Array.from(getNestedAnnotations(new MultipleHoist()))).toThrow(
      new Error("Multiple @nested.hoist annotations are not allowed in the same class: #hoisted1 and field2")
    );
  });
});

describe("StandardNestedFetcher", () => {
  test("builds key paths from private names", () => {
    class Sample {
      @nested field1 = [new Other()];
      @nested #privateField1 = new Other();
      @nested accessor #privateAccessor1 = [new Other(), new Other()];
      @nested get #privateGetter1() {
        return [this.#privateField1];
      }

      readPrivate() {
        return { field: this.#privateField1, accessor: this.#privateAccessor1, getter: this.#privateGetter1 };
      }
    }
    const sample = new Sample();
    const privates = sample.readPrivate();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    expect(Array.from(fetcher, (entry) => [entry.key, entry.keyPath])).toEqual([
      ["#privateGetter1", "#privateGetter1.0"],
      ["field1", "field1.0"],
      ["#privateField1", "#privateField1"],
      ["#privateAccessor1", "#privateAccessor1.0"],
      ["#privateAccessor1", "#privateAccessor1.1"],
    ]);
    expect(fetcher.dataMap.get("#privateField1" as KeyPath)).toBe(privates.field);
    expect(fetcher.dataMap.get("#privateAccessor1.1" as KeyPath)).toBe(privates.accessor[1]);
    expect(fetcher.dataMap.get("#privateGetter1.0" as KeyPath)).toBe(privates.field);
  });

  test("hoists a private accessor to KeyPath.Self", () => {
    class Sample {
      @nested.hoist accessor #items = [new Other(), new Other()];

      readItems() {
        return this.#items;
      }
    }
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    const entries = Array.from(fetcher);
    expect(entries.map((entry) => [entry.key, entry.keyPath])).toEqual([
      [KeyPath.Self, "0"],
      [KeyPath.Self, "1"],
    ]);
    expect(entries[1].data).toBe(sample.readItems()[1]);
    expect(Array.from(fetcher.getForKey(KeyPath.Self))).toHaveLength(2);
    expect(Array.from(fetcher.getForKey("#items" as KeyPath))).toHaveLength(0);
  });

  test("notifies observers when observable accessors, including private ones, are mutated or reassigned", () => {
    class Sample {
      @nested @observable accessor list = [new Other()];
      @nested @observable accessor #privateList = [new Other()];

      pushPrivate() {
        this.#privateList.push(new Other());
      }

      replacePrivate() {
        this.#privateList = [];
      }

      readPrivate() {
        return this.#privateList;
      }
    }
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    const observer = observeDataMap(fetcher);
    expect(Array.from(observer.last!.keys())).toEqual(["list.0", "#privateList.0"]);

    runInAction(() => sample.list.push(new Other()));
    expect(observer.runs).toBe(2);
    expect(Array.from(observer.last!.keys())).toEqual(["list.0", "list.1", "#privateList.0"]);

    runInAction(() => sample.pushPrivate());
    expect(observer.runs).toBe(3);
    expect(Array.from(observer.last!.keys())).toEqual(["list.0", "list.1", "#privateList.0", "#privateList.1"]);

    runInAction(() => sample.replacePrivate());
    expect(observer.runs).toBe(4);
    expect(Array.from(observer.last!.keys())).toEqual(["list.0", "list.1"]);

    runInAction(() => {
      sample.list[0].value++;
    });
    expect(observer.runs).toBe(4);
  });

  test("does not see reassignment of a private field without @observable while observed", () => {
    // Documented: "For mutable properties, combine with @observable"
    class Sample {
      @nested #child = new Other();

      replaceChild() {
        this.#child = new Other();
      }

      readChild() {
        return this.#child;
      }
    }
    const sample = new Sample();
    const initial = sample.readChild();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    const observer = observeDataMap(fetcher);

    sample.replaceChild();
    expect(Array.from(fetcher, (entry) => entry.data)).toEqual([sample.readChild()]);
    expect(observer.runs).toBe(1);
    expect(fetcher.dataMap.get("#child" as KeyPath)).toBe(initial);
  });

  test("reads computed getters", () => {
    class Sample {
      @observable accessor source = [new Other()];

      @nested
      @computed
      get view() {
        return this.source.slice(0, 1);
      }
    }
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    const observer = observeDataMap(fetcher);
    expect(Array.from(observer.last!.keys())).toEqual(["view.0"]);

    runInAction(() => sample.source.push(new Other()));
    expect(observer.runs).toBe(1);

    runInAction(() => sample.source.unshift(new Other()));
    expect(observer.runs).toBe(2);
    expect(observer.last!.get("view.0" as KeyPath)).toBe(sample.source[0]);
  });

  test("a fetcher created in a base-class constructor does not see annotations of subclasses", () => {
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
    // PINNED(quirk): Stage-3 annotations are registered by per-instance initializers, and subclass initializers run only after the base constructor returns, while the fetcher resolves annotations once in its constructor. So "derived" is never fetched by this fetcher (Watcher/Validator created from a base constructor would be affected alike). Decide: should StandardNestedFetcher resolve annotations lazily, on first iteration?
    expect(Array.from(derived.fetcher, (entry) => entry.keyPath)).toEqual(["base.0"]);
    expect(Array.from(new StandardNestedFetcher(derived, (entry) => entry.data), (entry) => entry.keyPath)).toEqual([
      "base.0",
      "derived.0",
    ]);
  });

  test("getValue reads a public property named like an annotated private member instead of the private member", () => {
    const objects = [new Other(), new Other()];
    class Sample {
      @nested #items = [objects[0]];
      "#items" = [objects[1]];

      readItems() {
        return this.#items;
      }
    }
    const sample = new Sample();
    expect(sample.readItems()).toEqual([objects[0]]);
    const [annotation] = Array.from(getNestedAnnotations(sample));
    expect(annotation.key).toBe("#items");
    // PINNED(bug): getValue checks `key in target` before using the decorator's private accessor, so the public property "#items" shadows the annotated private field. Expected: the annotated private field (objects[0]) is read. Flip these assertions when fixing.
    expect(annotation.getValue()).toEqual([objects[1]]);
    expect(Array.from(new StandardNestedFetcher(sample, (entry) => entry.data), (entry) => entry.data)).toEqual([
      objects[1],
    ]);
  });

  test("private members with the same name in a parent and a child class share one annotation entry", () => {
    const objects = [new Other(), new Other()];
    class Parent {
      @nested #items = [objects[0]];

      readParentItems() {
        return this.#items;
      }
    }
    class Child extends Parent {
      @nested #items = [objects[1]];

      readChildItems() {
        return this.#items;
      }
    }
    const child = new Child();
    expect(child.readParentItems()).toEqual([objects[0]]);
    expect(child.readChildItems()).toEqual([objects[1]]);
    // PINNED(bug): Annotations are keyed by the private name "#items", so the two distinct private fields collapse into one entry whose getValue reads the parent's field; the child's field is never fetched. Expected: two entries (one per private field), each reading its own field. Flip these assertions when fixing.
    expect(Array.from(getNestedAnnotations(child), ({ key, getValue }) => [key, getValue()])).toEqual([
      ["#items", [objects[0]]],
    ]);
    expect(Array.from(new StandardNestedFetcher(child, (entry) => entry.data), (entry) => entry.keyPath)).toEqual([
      "#items.0",
    ]);
  });

  test("private members with the same name in a parent and a child class are validated as the same key", () => {
    const objects = [new Other(), new Other()];
    class HoistParent {
      @nested.hoist #items = [objects[0]];

      readParentItems() {
        return this.#items;
      }
    }
    class MixedChild extends HoistParent {
      @nested #items = [objects[1]];

      readChildItems() {
        return this.#items;
      }
    }
    // PINNED(bug): The parent's hoisted #items and the child's unrelated #items are treated as one key, so a "Mixed" error is thrown although each member has a single annotation. Expected: no error; the entries are independent. Flip this assertion when fixing.
    expect(() => new StandardNestedFetcher(new MixedChild(), (entry) => entry.data)).toThrow(
      new Error("Mixed @nested annotations are not allowed for the same key: #items")
    );

    class HoistChild extends HoistParent {
      @nested.hoist accessor #items = [objects[1]];

      readChildItems() {
        return this.#items;
      }
    }
    const hoistChild = new HoistChild();
    // PINNED(bug): Two distinct hoisted private members pass the single-hoist restriction because they share the name "#items", and only the parent's is fetched. Expected: throw "Multiple @nested.hoist annotations are not allowed in the same class: #items and #items". Flip this assertion when fixing.
    expect(
      Array.from(new StandardNestedFetcher(hoistChild, (entry) => entry.data), (entry) => [entry.keyPath, entry.data])
    ).toEqual([["0", objects[0]]]);
    expect(hoistChild.readChildItems()).toEqual([objects[1]]);
  });

  test("observable boxes and collections are unwrapped", () => {
    class Sample {
      @nested boxed = observable.box([new Other()]);
      @nested map = observable.map([["key", new Other()]]);
    }
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);
    expect(Array.from(fetcher, (entry) => entry.keyPath)).toEqual(["boxed.0", "map.key"]);
  });
});
