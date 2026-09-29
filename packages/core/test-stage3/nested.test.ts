// biome-ignore-all lint/plugin/mobxMissingMakeObservable: stage-3 decorators need no makeObservable(this)
import { autorun, computed, observable, runInAction } from "mobx";
import { onTestFinished } from "vitest";
import { KeyPath } from "../src/keyPath";
import { getNestedAnnotations, nested, StandardNestedFetcher } from "../src/nested";
import { Stage2Base, Stage2Leaf } from "../src/stage2Fixtures";

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

  test("getValue reads the annotated private member, not the public property spelled like it", () => {
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
    expect(annotation.getValue()).toEqual([objects[0]]);
    expect(Array.from(new StandardNestedFetcher(sample, (entry) => entry.data), (entry) => entry.data)).toEqual([
      objects[0],
    ]);
  });

  test("private members with the same name in a parent and a child class get an annotation each, but no fetcher", () => {
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
    expect(Array.from(getNestedAnnotations(child), ({ key, getValue }) => [key, getValue()])).toEqual([
      ["#items", [objects[0]]],
      ["#items", [objects[1]]],
    ]);
    // This assertion REVERSES a pinned Expected, and is not a regression: the PINNED(bug) this test comes from read
    // "Expected: two entries (one per private field), each reading its own field", and once the members were told
    // apart the fetcher did yield two, both under the key path "#items.0". The maintainer has since decided to reject
    // that shape instead: for @nested a key path is the address (dataMap, Watcher#nested, Validator#nested,
    // Form#subForms and every error lookup are keyed by it), so one of two members spelling it would be unreachable.
    // The annotations above stay separate all the same: the member separation behind them is what lets @watch
    // reach each of two same-named private members.
    expect(() => new StandardNestedFetcher(child, (entry) => entry.data)).toThrow(
      new Error("Multiple @nested annotations are not allowed on members that share a key path: #items")
    );
  });

  test("private members with the same name in a parent and a child class are validated on their own", () => {
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
    // Each member carries a single annotation, so the modes are not mixed
    expect(
      Array.from(new StandardNestedFetcher(new MixedChild(), (entry) => entry.data), (entry) => [
        entry.keyPath,
        entry.data,
      ])
    ).toEqual([
      ["0", objects[0]],
      ["#items.0", objects[1]],
    ]);

    class HoistChild extends HoistParent {
      @nested.hoist accessor #items = [objects[1]];

      readChildItems() {
        return this.#items;
      }
    }
    const hoistChild = new HoistChild();
    expect(() => new StandardNestedFetcher(hoistChild, (entry) => entry.data)).toThrow(
      new Error("Multiple @nested.hoist annotations are not allowed in the same class: #items and #items")
    );
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

describe("Subclasses of a class annotated with stage-2 decorators", () => {
  // A stage-3 initializer finds the processor the stage-2 annotated base left on its prototype, and clones it onto
  // the instance instead of registering into it. So every instance of every subclass of Stage2Base is annotated
  // with the base's `child` and with its own `#own`, and with nothing of its siblings.
  class Sibling1 extends Stage2Base {
    @nested accessor #own = new Stage2Leaf();

    readOwn() {
      return this.#own;
    }
  }
  class Sibling2 extends Stage2Base {
    @nested accessor #own = new Stage2Leaf();

    readOwn() {
      return this.#own;
    }
  }

  /** The entries of a fetcher built for the target */
  function fetchEntries(target: object) {
    return Array.from(new StandardNestedFetcher(target, (entry) => entry.data));
  }

  test("the same-named private member of a sibling class is not an annotation of this one", () => {
    const sibling1 = new Sibling1();
    const sibling2 = new Sibling2();

    // Each instance holds a clone of the base's processor with its own "#own" added, so the sibling's member of
    // that name is nowhere in it -- whichever class was instantiated first, and however many instances there are
    for (const sample of [sibling1, sibling2, new Sibling1(), new Sibling2()]) {
      expect(Array.from(getNestedAnnotations(sample), ({ key }) => key)).toEqual(["child", "#own"]);
      expect(Array.from(fetchEntries(sample), (entry) => entry.keyPath)).toEqual(["child", "#own"]);
    }

    const [child1, own1] = fetchEntries(sibling1);
    expect(child1.data).toBe(sibling1.child);
    expect(own1.data).toBe(sibling1.readOwn());
    const [child2, own2] = fetchEntries(sibling2);
    expect(child2.data).toBe(sibling2.child);
    expect(own2.data).toBe(sibling2.readOwn());
  });

  test("a later instance is annotated with its own member, not with the first instance's", () => {
    class Sibling3 extends Stage2Base {
      @nested accessor #own = new Stage2Leaf();

      readOwn() {
        return this.#own;
      }
    }
    // A class of its own, so that the only earlier registration for "#own" is the one this test built
    const first = new Sibling3();
    const later = new Sibling3();
    const [child, own] = fetchEntries(later);

    // The stage-2 member has no accessor of its own, so it is read off the target: this instance's property
    expect(child.data).toBe(later.child);
    // The stage-3 one carries the accessor bound to the instance its initializer ran on, and that accessor lives
    // in a clone this instance owns, so a later instance reads its own field rather than the first one's. Before
    // the clone, every instance registered into the one processor the base's prototype holds, which kept the first
    // registration and handed its field to all of them.
    expect(own.data).toBe(later.readOwn());
    expect(own.data).not.toBe(first.readOwn());
  });

  test("same-named private members of a parent and a child class are both carried, and still share a key path", () => {
    class Parent extends Stage2Base {
      @nested accessor #twin = new Stage2Leaf();

      readParentTwin() {
        return this.#twin;
      }
    }
    class Child extends Parent {
      @nested accessor #twin = new Stage2Leaf();

      readChildTwin() {
        return this.#twin;
      }
    }

    const child = new Child();
    expect(child.readParentTwin()).not.toBe(child.readChildTwin());
    // Unlike a sibling's member, both of these register on the one instance, so the clone it owns holds the two of
    // them, and the key path they spell can only address one
    expect(Array.from(getNestedAnnotations(child), ({ key }) => key)).toEqual(["child", "#twin", "#twin"]);
    expect(() => new StandardNestedFetcher(child, (entry) => entry.data)).toThrow(
      new Error("Multiple @nested annotations are not allowed on members that share a key path: #twin")
    );
  });
});
