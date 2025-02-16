import { makeObservable, observable } from "mobx";
import { getNestedAnnotations, nested, StandardNestedFetcher } from "./nested";

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

describe("getNestedAnnotations", () => {
  it("returns all nested annotations", () => {
    const sample = new Sample();
    const annotations = getNestedAnnotations(sample);
    const map = new Map(annotations);

    expect(new Set(map.keys())).toEqual(
      new Set([
        symbolKey1,

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
      ])
    );
    expect(map.size).toBe(35);

    for (const [key, getValue] of map) {
      expect(key in sample).toBe(true);
      expect(sample[key as keyof Sample]).toBe(getValue());
    }
  });
});

describe("StandardNestedFetcher", () => {
  it("returns all nested entries except for symbol keys", () => {
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => entry.data);

    const map = new Map<string, any>();
    for (const entry of fetcher) {
      map.set(entry.keyPath, entry.data);
    }

    expect(map.size).toBe(36);

    expect(map.get("number1")).toEqual(sample.number1);
    expect(map.get("object1")).toEqual(sample.object1);
    expect(map.get("other1")).toEqual(sample.other1);
    expect(map.get("array1.0")).toEqual(sample.array1[0]);
    expect(map.get("array2.0")).toEqual(sample.array2[0]);
    expect(map.get("otherArray1.0")).toEqual(sample.otherArray1[0]);
    expect(map.get("set1.0")).toEqual(Array.from(sample.set1)[0]);
    expect(map.get("set2.0")).toEqual(Array.from(sample.set2)[0]);
    expect(map.get("otherSet1.0")).toEqual(Array.from(sample.otherSet1)[0]);
    expect(map.get("map1.key1")).toEqual(sample.map1.get("key1"));
    expect(map.get("map2.key1")).toEqual(sample.map2.get("key1"));
    expect(map.get("otherMap1.key1")).toEqual(sample.otherMap1.get("key1"));

    expect(map.get("boxedNumber1")).toEqual(sample.boxedNumber1.get());
    expect(map.get("boxedObject1")).toEqual(sample.boxedObject1.get());
    expect(map.get("boxedOther1")).toEqual(sample.boxedOther1.get());
    expect(map.get("boxedArray1.0")).toEqual(sample.boxedArray1.get()[0]);
    expect(map.get("boxedArray2.0")).toEqual(sample.boxedArray2.get()[0]);
    expect(map.get("boxedOtherArray1.0")).toEqual(sample.boxedOtherArray1.get()[0]);
    expect(map.get("boxedSet1.0")).toEqual(Array.from(sample.boxedSet1.get())[0]);
    expect(map.get("boxedSet2.0")).toEqual(Array.from(sample.boxedSet2.get())[0]);
    expect(map.get("boxedOtherSet1.0")).toEqual(Array.from(sample.boxedOtherSet1.get())[0]);
    expect(map.get("boxedMap1.key1")).toEqual(sample.boxedMap1.get().get("key1"));
    expect(map.get("boxedMap2.key1")).toEqual(sample.boxedMap2.get().get("key1"));
    expect(map.get("boxedOtherMap1.key1")).toEqual(sample.boxedOtherMap1.get().get("key1"));

    expect(map.get("refObject1")).toEqual(sample.refObject1);
    expect(map.get("refOther1")).toEqual(sample.refOther1);
    expect(map.get("refArray1.0")).toEqual(sample.refArray1[0]);
    expect(map.get("refOtherArray1.0")).toEqual(sample.refOtherArray1[0]);
    expect(map.get("refSet1.0")).toEqual(Array.from(sample.refSet1)[0]);
    expect(map.get("refSet2.0")).toEqual(Array.from(sample.refSet2)[0]);
    expect(map.get("refOtherSet1.0")).toEqual(Array.from(sample.refOtherSet1)[0]);
    expect(map.get("refMap1.key1")).toEqual(sample.refMap1.get("key1"));
    expect(map.get("refMap2.key1")).toEqual(sample.refMap2.get("key1"));
    expect(map.get("refOtherMap1.key1")).toEqual(sample.refOtherMap1.get("key1"));
  });

  it("ignores null data", () => {
    const sample = new Sample();
    const fetcher = new StandardNestedFetcher(sample, (entry) => (entry.data instanceof Other ? entry.data : null));

    const map = new Map<string, any>();
    for (const entry of fetcher) {
      map.set(entry.keyPath, entry.data);
    }

    expect(new Set(map.keys())).toEqual(
      new Set([
        "other1",
        "otherArray1.0",
        "otherMap1.key1",
        "otherSet1.0",

        "boxedOther1",
        "boxedOtherArray1.0",
        "boxedOtherMap1.key1",
        "boxedOtherSet1.0",

        "refOther1",
        "refOtherArray1.0",
        "refOtherMap1.key1",
        "refOtherSet1.0",
      ])
    );
    expect(map.size).toBe(12);
  });
});
