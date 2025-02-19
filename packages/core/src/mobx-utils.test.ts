import { observable, reaction, runInAction, makeObservable, computed, action } from "mobx";
import { getMobxObservableAnnotations, shallowReadValue, unwrapShallowContents } from "./mobx-utils";

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
});

describe("unwrapShallowContents", () => {
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
});
