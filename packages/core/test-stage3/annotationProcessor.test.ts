// biome-ignore-all lint/correctness/noUnusedPrivateClassMembers: these private members exist to be decorated and read back through the processor
import { AnnotationProcessor, createPropertyLikeAnnotation, getAnnotationProcessor } from "../src/annotationProcessor";
import { isDecorator202112, isDecorator202203 } from "../src/decorator";

const sampleKey = Symbol("sample");

function mapValues<K, V, R>(map: Map<K, V>, fn: (value: V, key: K) => R) {
  const result = new Map<K, R>();
  for (const [key, value] of map) {
    result.set(key, fn(value, key));
  }
  return result;
}
function extractStoredData(processor: AnnotationProcessor) {
  return mapValues(processor.getPropertyLike(sampleKey)!, (v) => v.data);
}
function extractValues(processor: AnnotationProcessor) {
  return mapValues(processor.getPropertyLike(sampleKey)!, (v) => v.get?.());
}
function annotatedKeys(target: object) {
  return [...(getAnnotationProcessor(target)?.getPropertyLike(sampleKey)?.keys() ?? [])];
}

describe("createPropertyLikeAnnotation", () => {
  describe("without inheritance", () => {
    const fn = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data of ${propertyKey}`;
    });
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      property1 = "value of property1";

      @sample
      accessor accessor1 = "value of accessor1";

      @sample
      get getter1() {
        return "value of getter1";
      }

      @sample
      #privateProperty1 = "value of privateProperty1";

      @sample
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }
    // Captured while tests are collected, so the assertion below does not depend on test order
    const callsAfterDeclaration = fn.mock.calls.length;

    test("processed at the time of instantiation", () => {
      expect(callsAfterDeclaration).toBe(0);
      const callsBefore = fn.mock.calls.length;

      new Sample();

      expect(fn.mock.calls.length - callsBefore).toBe(6);
      expect(fn).toBeCalledWith("property1");
      expect(fn).toBeCalledWith("accessor1");
      expect(fn).toBeCalledWith("getter1");
      expect(fn).toBeCalledWith("#privateProperty1");
      expect(fn).toBeCalledWith("#privateAccessor1");
      expect(fn).toBeCalledWith("#privateGetter1");
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data of getter1",
          ],
          "#privateGetter1" => [
            "data of #privateGetter1",
          ],
          "property1" => [
            "data of property1",
          ],
          "accessor1" => [
            "data of accessor1",
          ],
          "#privateProperty1" => [
            "data of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });
  });

  describe("with inheritance", () => {
    const fn = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[12]|#private(Property|Getter|Accessor)[12]$/);
      return `data of ${propertyKey}`;
    });
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      property1 = "value of property1";

      @sample
      accessor accessor1 = "value of accessor1";

      @sample
      get getter1() {
        return "value of getter1";
      }

      @sample
      #privateProperty1 = "value of privateProperty1";

      @sample
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }

    class Extended extends Sample {
      @sample
      property2 = "value of property2";

      @sample
      accessor accessor2 = "value of accessor2";

      @sample
      get getter2() {
        return "value of getter2";
      }

      @sample
      #privateProperty2 = "value of privateProperty2";

      @sample
      accessor #privateAccessor2 = "value of privateAccessor2";

      @sample
      get #privateGetter2() {
        return "value of privateGetter2";
      }
    }
    // Captured while tests are collected, so the assertion below does not depend on test order
    const callsAfterDeclaration = fn.mock.calls.length;

    test("processed at the time of instantiation", () => {
      expect(callsAfterDeclaration).toBe(0);
      const callsBefore = fn.mock.calls.length;

      new Extended();

      expect(fn.mock.calls.length - callsBefore).toBe(12);
      expect(fn).toBeCalledWith("property1");
      expect(fn).toBeCalledWith("accessor1");
      expect(fn).toBeCalledWith("getter1");
      expect(fn).toBeCalledWith("#privateProperty1");
      expect(fn).toBeCalledWith("#privateAccessor1");
      expect(fn).toBeCalledWith("#privateGetter1");
      expect(fn).toBeCalledWith("property2");
      expect(fn).toBeCalledWith("accessor2");
      expect(fn).toBeCalledWith("getter2");
      expect(fn).toBeCalledWith("#privateProperty2");
      expect(fn).toBeCalledWith("#privateAccessor2");
      expect(fn).toBeCalledWith("#privateGetter2");
    });

    test("getAnnotationProcessor returns own annotations for the parent", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data of getter1",
          ],
          "#privateGetter1" => [
            "data of #privateGetter1",
          ],
          "property1" => [
            "data of property1",
          ],
          "accessor1" => [
            "data of accessor1",
          ],
          "#privateProperty1" => [
            "data of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Extended();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data of getter1",
          ],
          "#privateGetter1" => [
            "data of #privateGetter1",
          ],
          "property1" => [
            "data of property1",
          ],
          "accessor1" => [
            "data of accessor1",
          ],
          "#privateProperty1" => [
            "data of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data of #privateAccessor1",
          ],
          "getter2" => [
            "data of getter2",
          ],
          "#privateGetter2" => [
            "data of #privateGetter2",
          ],
          "property2" => [
            "data of property2",
          ],
          "accessor2" => [
            "data of accessor2",
          ],
          "#privateProperty2" => [
            "data of #privateProperty2",
          ],
          "#privateAccessor2" => [
            "data of #privateAccessor2",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
          "getter2" => "value of getter2",
          "#privateGetter2" => "value of privateGetter2",
          "property2" => "value of property2",
          "accessor2" => "value of accessor2",
          "#privateProperty2" => "value of privateProperty2",
          "#privateAccessor2" => "value of privateAccessor2",
        }
      `);
    });
  });

  describe("with overrides", () => {
    const fn1 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data 1 of ${propertyKey}`;
    });
    const sample1 = createPropertyLikeAnnotation(sampleKey, fn1);

    const fn2 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data 2 of ${propertyKey}`;
    });
    const sample2 = createPropertyLikeAnnotation(sampleKey, fn2);

    class Sample {
      @sample1
      property1 = "value of property1";

      @sample1
      accessor accessor1 = "value of accessor1";

      @sample1
      get getter1() {
        return "value of getter1";
      }

      @sample1
      #privateProperty1 = "value of privateProperty1";

      @sample1
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample1
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }

    class Overridden extends Sample {
      @sample2
      override property1 = "value of property1 (overridden)";

      @sample2
      override accessor accessor1 = "value of accessor1 (overridden)";

      @sample2
      override get getter1() {
        return "value of getter1 (overridden)";
      }

      // A #private name belongs to the class that declares it, so these three override nothing and TypeScript
      // rejects `override` (TS4113). They are kept as written: the processor keys annotations by name, so it
      // still merges them with the parent's -- the collision the snapshots below pin.
      @sample2
      // @ts-expect-error TS4113: see above
      override #privateProperty1 = "value of privateProperty1 (overridden)";

      @sample2
      // @ts-expect-error TS4113: see above
      override accessor #privateAccessor1 = "value of privateAccessor1 (overridden)";

      @sample2
      // @ts-expect-error TS4113: see above
      override get #privateGetter1() {
        return "value of privateGetter1 (overridden)";
      }
    }
    // Captured while tests are collected, so the assertions below do not depend on test order
    const calls1AfterDeclaration = fn1.mock.calls.length;
    const calls2AfterDeclaration = fn2.mock.calls.length;

    test("processed at the time of instantiation", () => {
      expect(calls1AfterDeclaration).toBe(0);
      expect(calls2AfterDeclaration).toBe(0);
      const calls1Before = fn1.mock.calls.length;
      const calls2Before = fn2.mock.calls.length;

      new Overridden();

      expect(fn1.mock.calls.length - calls1Before).toBe(6);
      expect(fn1).toBeCalledWith("property1");
      expect(fn1).toBeCalledWith("accessor1");
      expect(fn1).toBeCalledWith("getter1");
      expect(fn1).toBeCalledWith("#privateProperty1");
      expect(fn1).toBeCalledWith("#privateAccessor1");
      expect(fn1).toBeCalledWith("#privateGetter1");

      expect(fn2.mock.calls.length - calls2Before).toBe(6);
      expect(fn2).toBeCalledWith("property1");
      expect(fn2).toBeCalledWith("accessor1");
      expect(fn2).toBeCalledWith("getter1");
      expect(fn2).toBeCalledWith("#privateProperty1");
      expect(fn2).toBeCalledWith("#privateAccessor1");
      expect(fn2).toBeCalledWith("#privateGetter1");
    });

    test("getAnnotationProcessor returns own annotations for the parent", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data 1 of getter1",
          ],
          "#privateGetter1" => [
            "data 1 of #privateGetter1",
          ],
          "property1" => [
            "data 1 of property1",
          ],
          "accessor1" => [
            "data 1 of accessor1",
          ],
          "#privateProperty1" => [
            "data 1 of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data 1 of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Overridden();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data 1 of getter1",
            "data 2 of getter1",
          ],
          "#privateGetter1" => [
            "data 1 of #privateGetter1",
            "data 2 of #privateGetter1",
          ],
          "property1" => [
            "data 1 of property1",
            "data 2 of property1",
          ],
          "accessor1" => [
            "data 1 of accessor1",
            "data 2 of accessor1",
          ],
          "#privateProperty1" => [
            "data 1 of #privateProperty1",
            "data 2 of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data 1 of #privateAccessor1",
            "data 2 of #privateAccessor1",
          ],
        }
      `);
      // PINNED(bug): Overridden's `#privateGetter1`, `#privateProperty1` and `#privateAccessor1` are new private members rather than overrides (tsc rejects `override` on them with TS4113), yet they merge into the parent's entries and `get` reads the parent's members, so the child's "(overridden)" values are unreachable through the processor. This is the defect pinned in "private names > same-named private fields of a parent and a child share one entry that reads the parent's field". Expected: the child's private members are reachable (the three private values would read "... (overridden)" or get separate entries). Flip this assertion when fixing.
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1 (overridden)",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1 (overridden)",
          "accessor1" => "value of accessor1 (overridden)",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });
  });

  describe("separate classes", () => {
    const fn1 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data 1 of ${propertyKey}`;
    });
    const sample1 = createPropertyLikeAnnotation(sampleKey, fn1);
    const fn2 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data 2 of ${propertyKey}`;
    });
    const sample2 = createPropertyLikeAnnotation(sampleKey, fn2);

    class Sample1 {
      @sample1
      property1 = "value of property1";

      @sample1
      accessor accessor1 = "value of accessor1";

      @sample1
      get getter1() {
        return "value of getter1";
      }

      @sample1
      #privateProperty1 = "value of privateProperty1";

      @sample1
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample1
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }
    class Sample2 {
      @sample2
      property1 = "value of property1";

      @sample2
      accessor accessor1 = "value of accessor1";

      @sample2
      get getter1() {
        return "value of getter1";
      }

      @sample2
      #privateProperty1 = "value of privateProperty1";

      @sample2
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample2
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }
    // Captured while tests are collected, so the assertions below do not depend on test order
    const calls1AfterDeclaration = fn1.mock.calls.length;
    const calls2AfterDeclaration = fn2.mock.calls.length;

    test("processed at the time of declaration", () => {
      expect(calls1AfterDeclaration).toBe(0);
      expect(calls2AfterDeclaration).toBe(0);
      const calls1Before = fn1.mock.calls.length;
      const calls2Before = fn2.mock.calls.length;

      new Sample1();
      new Sample2();

      expect(fn1.mock.calls.length - calls1Before).toBe(6);
      expect(fn1).toBeCalledWith("property1");
      expect(fn1).toBeCalledWith("accessor1");
      expect(fn1).toBeCalledWith("getter1");
      expect(fn1).toBeCalledWith("#privateProperty1");
      expect(fn1).toBeCalledWith("#privateAccessor1");
      expect(fn1).toBeCalledWith("#privateGetter1");
      expect(fn2.mock.calls.length - calls2Before).toBe(6);
      expect(fn2).toBeCalledWith("property1");
      expect(fn2).toBeCalledWith("accessor1");
      expect(fn2).toBeCalledWith("getter1");
      expect(fn2).toBeCalledWith("#privateProperty1");
      expect(fn2).toBeCalledWith("#privateAccessor1");
      expect(fn2).toBeCalledWith("#privateGetter1");
    });

    test("annotations should not mix", () => {
      const obj1 = new Sample1();
      const processor1 = getAnnotationProcessor(obj1);
      expect(processor1).toBeTruthy();
      expect(extractStoredData(processor1!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data 1 of getter1",
          ],
          "#privateGetter1" => [
            "data 1 of #privateGetter1",
          ],
          "property1" => [
            "data 1 of property1",
          ],
          "accessor1" => [
            "data 1 of accessor1",
          ],
          "#privateProperty1" => [
            "data 1 of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data 1 of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor1!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);

      const obj2 = new Sample2();
      const processor2 = getAnnotationProcessor(obj2);
      expect(processor2).toBeTruthy();
      expect(extractStoredData(processor2!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data 2 of getter1",
          ],
          "#privateGetter1" => [
            "data 2 of #privateGetter1",
          ],
          "property1" => [
            "data 2 of property1",
          ],
          "accessor1" => [
            "data 2 of accessor1",
          ],
          "#privateProperty1" => [
            "data 2 of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data 2 of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor2!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });
  });

  describe("per-instance processors", () => {
    const fn = vi.fn((propertyKey: string | symbol) => `data of ${String(propertyKey)}`);
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      property1 = "value of property1";
    }

    test("each instance owns a separate processor and nothing is stored on the prototype", () => {
      const obj1 = new Sample();
      const obj2 = new Sample();
      const processor1 = getAnnotationProcessor(obj1);
      const processor2 = getAnnotationProcessor(obj2);

      expect(processor1).toBeInstanceOf(AnnotationProcessor);
      expect(processor2).toBeInstanceOf(AnnotationProcessor);
      expect(processor1).not.toBe(processor2);
      expect(getAnnotationProcessor(Sample.prototype)).toBeNull();
      expect(getAnnotationProcessor(Sample)).toBeNull();
    });

    test("getData is called for every instantiation and annotations do not accumulate", () => {
      const callsBefore = fn.mock.calls.length;
      const obj1 = new Sample();
      new Sample();
      new Sample();

      expect(fn.mock.calls.length - callsBefore).toBe(3);
      expect(extractStoredData(getAnnotationProcessor(obj1)!)).toEqual(
        new Map([["property1", ["data of property1"]]])
      );
    });

    test("objects derived from an instance resolve the instance's processor", () => {
      const obj = new Sample();
      expect(getAnnotationProcessor(Object.create(obj))).toBe(getAnnotationProcessor(obj));
    });
  });

  describe("value getters", () => {
    const sample = createPropertyLikeAnnotation(sampleKey, () => true);
    const symbolKey = Symbol("symbolKey");

    class Sample {
      @sample
      property1 = "value of property1";

      @sample
      accessor accessor1 = "value of accessor1";

      @sample
      get getter1() {
        return `getter of ${this.property1}`;
      }

      @sample
      #privateProperty1 = "value of privateProperty1";

      @sample
      [symbolKey] = "value of symbolKey";

      setPrivateProperty1(value: string) {
        this.#privateProperty1 = value;
      }
    }

    test("read the current value of the instance they were registered for", () => {
      const obj1 = new Sample();
      const obj2 = new Sample();

      obj1.property1 = "updated property1";
      obj1.accessor1 = "updated accessor1";
      obj1.setPrivateProperty1("updated privateProperty1");
      obj1[symbolKey] = "updated symbolKey";

      expect(extractValues(getAnnotationProcessor(obj1)!)).toEqual(
        new Map<string | symbol, unknown>([
          ["getter1", "getter of updated property1"],
          ["property1", "updated property1"],
          ["accessor1", "updated accessor1"],
          ["#privateProperty1", "updated privateProperty1"],
          [symbolKey, "updated symbolKey"],
        ])
      );
      expect(extractValues(getAnnotationProcessor(obj2)!)).toEqual(
        new Map<string | symbol, unknown>([
          ["getter1", "getter of value of property1"],
          ["property1", "value of property1"],
          ["accessor1", "value of accessor1"],
          ["#privateProperty1", "value of privateProperty1"],
          [symbolKey, "value of symbolKey"],
        ])
      );
    });
  });

  describe("symbol keys", () => {
    test("the symbol itself is passed to getData and used as the property key", () => {
      const fn = vi.fn((propertyKey: string | symbol) => `data of ${String(propertyKey)}`);
      const sample = createPropertyLikeAnnotation(sampleKey, fn);
      const symbolKey = Symbol("symbolKey");

      class Sample {
        @sample
        [symbolKey] = "value of symbolKey";
      }

      const annotations = getAnnotationProcessor(new Sample())!.getPropertyLike(sampleKey)!;
      expect(fn).toBeCalledTimes(1);
      expect(fn).toBeCalledWith(symbolKey);
      expect([...annotations.keys()]).toEqual([symbolKey]);
      expect(annotations.get(symbolKey)!.data).toEqual(["data of Symbol(symbolKey)"]);
    });
  });

  describe("stacked annotations", () => {
    test("decorators are applied bottom-up", () => {
      const calls: string[] = [];
      const outer = createPropertyLikeAnnotation(sampleKey, (propertyKey) => {
        calls.push(`outer of ${String(propertyKey)}`);
        return `outer of ${String(propertyKey)}`;
      });
      const inner = createPropertyLikeAnnotation(sampleKey, (propertyKey) => {
        calls.push(`inner of ${String(propertyKey)}`);
        return `inner of ${String(propertyKey)}`;
      });

      class Sample {
        @outer
        @inner
        property1 = "value of property1";

        @outer
        @outer
        property2 = "value of property2";
      }

      const annotations = getAnnotationProcessor(new Sample())!.getPropertyLike(sampleKey)!;
      expect(calls).toEqual(["inner of property1", "outer of property1", "outer of property2", "outer of property2"]);
      expect(annotations.get("property1")!.data).toEqual(["inner of property1", "outer of property1"]);
      expect(annotations.get("property2")!.data).toEqual(["outer of property2", "outer of property2"]);
    });
  });

  describe("registration order", () => {
    test("inherited members first, then own methods and getters, then own fields and accessors in declaration order", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, () => true);

      class Base {
        @sample
        baseProperty = "value of baseProperty";
      }
      class Sample extends Base {
        @sample
        property1 = "value of property1";

        @sample
        accessor accessor1 = "value of accessor1";

        @sample
        get getter1() {
          return "value of getter1";
        }

        // @ts-expect-error the declared decorator type has no method overload
        @sample
        method1() {
          return "value of method1";
        }
      }

      expect([...getAnnotationProcessor(new Sample())!.getPropertyLike(sampleKey)!.keys()]).toEqual([
        "baseProperty",
        "getter1",
        "method1",
        "property1",
        "accessor1",
      ]);
    });
  });

  describe("base class constructor", () => {
    test("sees only the annotations registered so far", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, () => true);
      let keysInBaseConstructor: (string | symbol)[] | undefined;

      class Base {
        @sample
        baseProperty = "value of baseProperty";

        constructor() {
          keysInBaseConstructor = [...(getAnnotationProcessor(this)?.getPropertyLike(sampleKey)?.keys() ?? [])];
        }
      }
      class Sample extends Base {
        @sample
        property1 = "value of property1";

        @sample
        get getter1() {
          return "value of getter1";
        }
      }

      const obj = new Sample();
      // PINNED(quirk): stage-3 annotations are registered by initializers during construction, so code in a base class constructor (e.g. a `Watcher.get(this)` call) sees only the base class's annotations, whereas stage-2 annotations are all available up front. Decide: is this an accepted stage-3 limitation to document, or should consumers defer reading annotations until construction completes?
      expect(keysInBaseConstructor).toEqual(["baseProperty"]);
      expect([...getAnnotationProcessor(obj)!.getPropertyLike(sampleKey)!.keys()]).toEqual([
        "baseProperty",
        "getter1",
        "property1",
      ]);
    });
  });

  describe("methods and setters", () => {
    test("are registered, with a get that returns the method and throws for a setter", () => {
      const fn = vi.fn((propertyKey: string | symbol) => `data of ${String(propertyKey)}`);
      const sample = createPropertyLikeAnnotation(sampleKey, fn);

      class Sample {
        // @ts-expect-error the declared decorator type has no method overload
        @sample
        method1() {
          return "value of method1";
        }

        // @ts-expect-error the declared decorator type has no setter overload
        @sample
        set setter1(_value: string) {}
      }

      const annotations = getAnnotationProcessor(new Sample())?.getPropertyLike(sampleKey);
      expect(fn).toBeCalledTimes(2);
      // PINNED(quirk): methods and setters are registered even though the JSDoc only lists properties, getters and class fields, and the declared decorator type has no method or setter overload (tsc reports TS1241; see "the stage-3 signature does not accept methods or setters" in src/annotationProcessor.test.ts). Decide: should non-property-like members be rejected or ignored?
      expect(annotations?.has("method1")).toBe(true);
      expect(annotations?.has("setter1")).toBe(true);
      expect(annotations?.get("method1")?.get?.()).toBe(Sample.prototype.method1);
      // PINNED(quirk): a setter context has no `access.get`, yet a `get` is registered unconditionally, so calling it throws "context.access.get is not a function". Decide: should setters be skipped, or registered without `get`?
      expect(() => annotations?.get("setter1")?.get?.()).toThrow(TypeError);
    });
  });

  describe("static members", () => {
    test("getData is called at the time of declaration but the annotations are unreachable", () => {
      const fn = vi.fn((propertyKey: string | symbol) => `data of ${String(propertyKey)}`);
      const sample = createPropertyLikeAnnotation(sampleKey, fn);

      class Sample {
        @sample
        static staticProperty1 = "value of staticProperty1";

        @sample
        static get staticGetter1() {
          return "value of staticGetter1";
        }

        @sample
        property1 = "value of property1";
      }

      expect(fn).toBeCalledTimes(2);
      expect(fn).toBeCalledWith("staticProperty1");
      expect(fn).toBeCalledWith("staticGetter1");

      const obj = new Sample();
      // PINNED(quirk): static initializers register on a processor stored against the constructor, but getAnnotationProcessor only walks values whose typeof is "object", so static annotations are silently unreachable. Decide: should static members be supported, or rejected when decorated?
      expect(getAnnotationProcessor(Sample)).toBeNull();
      expect([...getAnnotationProcessor(obj)!.getPropertyLike(sampleKey)!.keys()]).toEqual(["property1"]);
    });
  });

  describe("private names", () => {
    test("a private name and a public string key with the same spelling share one entry", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);

      class Sample {
        @sample
        ["#field"] = "public value";

        @sample
        #field = "private value";

        readPrivate() {
          return this.#field;
        }
      }

      const obj = new Sample();
      const annotations = getAnnotationProcessor(obj)!.getPropertyLike(sampleKey)!;
      expect(obj.readPrivate()).toBe("private value");
      // PINNED(quirk): private members are keyed by their spelling ("#field"), so they collide with a public string key of the same spelling; the data is merged and `get` reads whichever member registered first (here the public one). Decide: should private members be keyed distinctly from public string keys?
      expect([...annotations.keys()]).toEqual(["#field"]);
      expect(annotations.get("#field")!.data).toEqual(["data of #field", "data of #field"]);
      expect(annotations.get("#field")!.get!()).toBe("public value");
    });

    test("same-named private fields of a parent and a child share one entry that reads the parent's field", () => {
      const parent = createPropertyLikeAnnotation(sampleKey, () => "parent");
      const child = createPropertyLikeAnnotation(sampleKey, () => "child");

      class Parent {
        @parent
        #field = "parent value";

        readParentField() {
          return this.#field;
        }
      }
      class Child extends Parent {
        @child
        #field = "child value";

        readChildField() {
          return this.#field;
        }
      }

      const obj = new Child();
      const entry = getAnnotationProcessor(obj)!.getPropertyLike(sampleKey)!.get("#field")!;
      expect(obj.readParentField()).toBe("parent value");
      expect(obj.readChildField()).toBe("child value");
      expect(entry.data).toEqual(["parent", "child"]);
      // PINNED(bug): the child's #field is a member distinct from the parent's #field (private names cannot be overridden), but both are merged under "#field" and `get` reads the parent's field, so the child's annotated private field can never be read through the processor (e.g. `@watch #field` in the child watches the parent's field instead). Expected: the child's private field is reachable through its own entry or getter. Flip this assertion when fixing.
      expect(entry.get!()).toBe("parent value");
    });
  });

  describe("private methods", () => {
    test("are registered under their private name with a get that returns the method", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);

      class Sample {
        value = "value of privateMethod1";

        // The runtime supports private methods (as the AnnotationProcessor JSDoc says), but the declared type does
        // not; see "the stage-3 signature does not accept methods or setters" in src/annotationProcessor.test.ts
        // @ts-expect-error the declared decorator type has no method overload
        @sample
        #privateMethod1() {
          return this.value;
        }

        callPrivateMethod1() {
          return this.#privateMethod1();
        }
      }

      const obj = new Sample();
      const entry = getAnnotationProcessor(obj)!.getPropertyLike(sampleKey)!.get("#privateMethod1")!;
      expect(entry.data).toEqual(["data of #privateMethod1"]);
      const method = entry.get!();
      expect(method).toBeTypeOf("function");
      expect(method.call(obj)).toBe("value of privateMethod1");
      expect(obj.callPrivateMethod1()).toBe("value of privateMethod1");
    });
  });

  describe("errors from getData", () => {
    test("are deferred to instantiation, propagate out of the constructor, and do not affect later instances", () => {
      let shouldThrow = true;
      const fn = vi.fn(() => {
        if (shouldThrow) throw new Error("getData failed");
        return true;
      });
      const sample = createPropertyLikeAnnotation(sampleKey, fn);

      class Sample {
        @sample
        property1 = "value of property1";
      }
      expect(fn).not.toBeCalled();

      expect(() => new Sample()).toThrow("getData failed");
      expect(fn).toBeCalledTimes(1);

      shouldThrow = false;
      const obj = new Sample();
      expect(extractStoredData(getAnnotationProcessor(obj)!)).toEqual(new Map([["property1", [true]]]));
    });
  });

  describe("constructors returning a different object", () => {
    test("annotations registered before a base constructor returns a proxy are not visible on the proxy", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, () => true);
      let original: object | undefined;

      class Base {
        @sample
        baseProperty = "value of baseProperty";

        constructor() {
          original = this;
          // biome-ignore lint/correctness/noConstructorReturn: a constructor that substitutes its instance is the scenario under test
          return new Proxy(this, {});
        }
      }
      class Sample extends Base {
        @sample
        property1 = "value of property1";
      }

      const obj = new Sample();
      expect(obj).not.toBe(original);
      expect(obj.baseProperty).toBe("value of baseProperty");
      expect(annotatedKeys(original!)).toEqual(["baseProperty"]);
      // PINNED(quirk): stage-3 processors are keyed by the object the initializer runs on, so when a base constructor returns a different object (here a proxy), the base class's annotations stay on the original object and the returned instance only sees the subclass's (stage-2 processors live on the prototype and are unaffected). Decide: should stage-3 annotations be keyed per class (e.g. via context.metadata) so a substituted instance still sees every annotation (["baseProperty", "property1"])?
      expect(annotatedKeys(obj)).toEqual(["property1"]);
    });
  });

  describe("decorator context detection", () => {
    test("every context passed to a stage-3 decorator is detected as stage3", () => {
      const contexts: DecoratorContext[] = [];
      const capture = (_value: unknown, context: DecoratorContext) => {
        contexts.push(context);
      };

      @capture
      class Sample {
        @capture
        property1 = "value of property1";

        @capture
        accessor accessor1 = "value of accessor1";

        @capture
        get getter1() {
          return "value of getter1";
        }

        @capture
        set setter1(_value: string) {}

        @capture
        method1() {
          return "value of method1";
        }

        @capture
        static staticProperty1 = "value of staticProperty1";

        @capture
        #privateProperty1 = "value of privateProperty1";
      }
      void Sample;

      expect(contexts.map((context) => context.kind).sort()).toEqual([
        "accessor",
        "class",
        "field",
        "field",
        "field",
        "getter",
        "method",
        "setter",
      ]);
      for (const context of contexts) {
        expect(isDecorator202203(context)).toBe(true);
        expect(isDecorator202112(context)).toBe(false);
      }
    });
  });
});
