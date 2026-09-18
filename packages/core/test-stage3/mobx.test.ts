// biome-ignore-all lint/plugin/mobxMissingMakeObservable: stage-3 decorators need no makeObservable(this)
/**
 * Test cases for undocumented/unclear behaviors of MobX with stage-3 decorators that are essential for the library
 *
 * ../src/mobx.test.ts has the ones that do not depend on stage-3 decorators.
 */

import { $mobx, computed, getAtom, isComputedProp, isObservableProp, observable } from "mobx";

describe("MobX with stage-3 decorators", () => {
  class Sample {
    @observable accessor #field1 = 1;

    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read back through getAtom
    @computed get #computed1() {
      return this.#field1 * 10;
    }
  }

  /** Read the value of an annotated key through its atom */
  const readAtom = (target: object, key: PropertyKey) => (getAtom(target, key) as unknown as { get(): unknown }).get();

  test("ECMAScript private members are annotated under their names, which are not properties", () => {
    const obj = new Sample();

    expect("#field1" in obj).toBe(false);
    expect("#computed1" in obj).toBe(false);
    // Before they are first read, which is when MobX 6.16+ applies the annotations
    expect(isObservableProp(obj, "#field1")).toBe(true);
    expect(isObservableProp(obj, "#computed1")).toBe(true);
    expect(readAtom(obj, "#field1")).toBe(1);
    expect(readAtom(obj, "#computed1")).toBe(10);
  });

  test("isComputedProp tells the keys of computed annotations apart, without applying the annotations", () => {
    // Each map separately, as applying an annotation moves its key from one map to another
    const heldKeysOf = (target: object) =>
      Object.values((target as any)[$mobx]).flatMap((value) => (value instanceof Map ? [[...value.keys()]] : []));
    const obj = new Sample();
    const heldKeys = heldKeysOf(obj);

    expect(isComputedProp(obj, "#computed1")).toBe(true);
    expect(isComputedProp(obj, "#field1")).toBe(false);
    expect(heldKeysOf(obj)).toEqual(heldKeys);

    readAtom(obj, "#field1");
    readAtom(obj, "#computed1");
    expect(isComputedProp(obj, "#computed1")).toBe(true);
    expect(isComputedProp(obj, "#field1")).toBe(false);
  });

  test("the administration holds private keys as keys of maps among its own enumerable properties", () => {
    // getMobxObservableAnnotations finds them this way, whatever the (mangled) names
    const keysInMaps = (target: object) =>
      Object.values((target as any)[$mobx]).flatMap((value) => (value instanceof Map ? [...value.keys()] : []));
    const obj = new Sample();

    expect(keysInMaps(obj)).toEqual(expect.arrayContaining(["#field1", "#computed1"]));

    readAtom(obj, "#field1");
    readAtom(obj, "#computed1");
    expect(keysInMaps(obj)).toEqual(expect.arrayContaining(["#field1", "#computed1"]));
  });
});
