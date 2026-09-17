// biome-ignore-all lint/plugin/mobxMissingMakeObservable: stage-3 decorators need no makeObservable(this)
import { $mobx, action, computed, observable, reaction, runInAction } from "mobx";
import { getMobxObservableAnnotations } from "../src/mobx-utils";

// The order of the keys is left out: stage-3 decorators define accessors on the prototype in an order that depends on
// how the decorators are compiled, and ../src/mobx-utils.test.ts covers the order of the rest.
describe("getMobxObservableAnnotations", () => {
  class Sample {
    @observable accessor field1 = 1;
    @observable.ref accessor #field2 = 2;
    plain = 3;

    @computed get computed1() {
      return this.field1 * 10;
    }
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read back through the function under test
    @computed.struct get #computed2() {
      return [this.#field2];
    }

    // biome-ignore lint/plugin/mobxUnboundParameterlessAction: models may declare actions as methods, which must be left out of the result
    @action action1() {}

    setField2(value: number) {
      this.#field2 = value;
    }
  }

  const readAll = (target: object) =>
    new Map([...getMobxObservableAnnotations(target)].map(([key, getValue]) => [key, getValue()]));

  /** The keys of each map held by the administration, which is where MobX keeps track of the annotations */
  const heldKeysOf = (target: object) =>
    Object.values((target as any)[$mobx]).flatMap((value) => (value instanceof Map ? [[...value.keys()]] : []));

  test("yields public and ECMAScript private keys, but not actions or other members", () => {
    expect(readAll(new Sample())).toEqual(
      new Map<string, unknown>([
        ["field1", 1],
        ["computed1", 10],
        ["#field2", 2],
        ["#computed2", [2]],
      ])
    );
  });

  test("reads through the getters of private keys are tracked by reactions", () => {
    const obj = new Sample();
    const effectFn = vi.fn<(key: PropertyKey, value: unknown) => void>();
    const disposers: (() => void)[] = [];
    for (const [key, getValue] of getMobxObservableAnnotations(obj)) {
      disposers.push(reaction(getValue, (value) => effectFn(key, value)));
    }

    runInAction(() => obj.setField2(4));
    expect(effectFn).toBeCalledTimes(2);
    expect(new Map(effectFn.mock.calls)).toEqual(
      new Map<string, unknown>([
        ["#field2", 4],
        ["#computed2", [4]],
      ])
    );

    for (const dispose of disposers) dispose();
  });

  test("enumeration alone neither evaluates getters nor materializes the annotations MobX 6.16+ applies lazily", () => {
    const getterFn = vi.fn(() => 1);
    class Lazy {
      @observable accessor field1 = 1;
      // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read back through the function under test
      @computed get #computed1() {
        return getterFn();
      }
    }
    const obj = new Lazy();
    const heldKeys = heldKeysOf(obj);

    const getters = new Map(getMobxObservableAnnotations(obj));
    expect(new Set(getters.keys())).toEqual(new Set(["field1", "#computed1"]));
    expect(heldKeysOf(obj)).toEqual(heldKeys);
    expect(getterFn).toBeCalledTimes(0);

    expect(getters.get("#computed1")!()).toBe(1);
    expect(getterFn).toBeCalledTimes(1);
  });

  test("getters consumed during the enumeration, as Watcher does, do not make keys yielded again", () => {
    const obj = new Sample();
    const seen: PropertyKey[] = [];
    const disposers: (() => void)[] = [];
    for (const [key, getValue] of getMobxObservableAnnotations(obj)) {
      seen.push(key);
      // The reaction reads the value right away, which materializes a lazily applied annotation
      disposers.push(reaction(getValue, () => {}));
    }

    expect(seen).toHaveLength(4);
    expect(new Set(seen)).toEqual(new Set(["field1", "computed1", "#field2", "#computed2"]));

    for (const dispose of disposers) dispose();
  });

  test("yields annotations of both base and derived classes, once for overridden keys", () => {
    class Base {
      @observable accessor base = 1;
      @observable accessor #basePrivate = 2;

      @computed get overridden() {
        return `base${this.#basePrivate}`;
      }
    }

    class Derived extends Base {
      @observable accessor derived = 3;

      // Stage-3 decorators have no @override: annotating the getter again is what overrides it
      @computed override get overridden() {
        return "derived";
      }
    }

    const derived = [...getMobxObservableAnnotations(new Derived())];
    expect(derived).toHaveLength(4);
    expect(new Map(derived.map(([key, getValue]) => [key, getValue()]))).toEqual(
      new Map<string, unknown>([
        ["base", 1],
        ["#basePrivate", 2],
        ["overridden", "derived"],
        ["derived", 3],
      ])
    );
    expect(readAll(new Base())).toEqual(
      new Map<string, unknown>([
        ["base", 1],
        ["#basePrivate", 2],
        ["overridden", "base2"],
      ])
    );
  });
});
